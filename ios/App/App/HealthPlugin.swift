import Foundation
import HealthKit
import Capacitor

// Reads Apple Health for device sync: daily steps (+ walking distance),
// weigh-ins, and workouts of every kind.
//
// It WRITES exactly one thing: a weigh-in the client typed into Gardnr, so
// Health has their whole weight history and not only what a scale sent. Never
// steps or workouts -- the phone and Watch already recorded those, and a second
// copy from Gardnr would be counted twice. Never a reading that came FROM
// Health either: a scale's weigh-in is already there. And it is marked
// user-entered, because App Review 5.1.3 forbids passing anything off as
// measured that was not.
//
// Shapes match supabase/functions/device-sync exactly, so the web layer passes
// what this returns straight through. Dates are the phone's LOCAL calendar
// date, per src/utils/dateHelpers.js: the phone is the only party that knows
// which day a 23:30 walk belonged to.
//
// Registered in GardnrBridgeViewController (SceneDelegate.swift). A local
// plugin rather than an npm one: this is health data, and a third-party package
// that reads it is a dependency to audit on every update, for ~200 lines.
@objc(HealthPlugin)
public class HealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthPlugin"
    public let jsName = "Health"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveWeight", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteSample", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readProfile", returnType: CAPPluginReturnPromise),
    ]

    private let store = HKHealthStore()

    private var readTypes: Set<HKObjectType> {
        var types: Set<HKObjectType> = [HKObjectType.workoutType()]
        let ids: [HKQuantityTypeIdentifier] = [
            .stepCount, .distanceWalkingRunning, .bodyMass,
            // Per-workout calories and average heart rate. Read through the
            // workout's own statistics, never as a standalone series.
            .activeEnergyBurned, .heartRate,
        ]
        for id in ids {
            if let t = HKObjectType.quantityType(forIdentifier: id) { types.insert(t) }
        }
        return types
    }

    // Read once, at onboarding, to fill in the details the starting targets
    // need, so a new client confirms them instead of typing them. Asked for in
    // the same sheet as the sync types, but kept OUT of `readTypes`: the write
    // path checks `readTypes` for anything new to ask, and a client who
    // connected before these existed must not get a permission sheet the next
    // time they save a weigh-in.
    private var profileTypes: Set<HKObjectType> {
        var types: Set<HKObjectType> = []
        if let sex = HKObjectType.characteristicType(forIdentifier: .biologicalSex) { types.insert(sex) }
        if let dob = HKObjectType.characteristicType(forIdentifier: .dateOfBirth) { types.insert(dob) }
        if let height = HKObjectType.quantityType(forIdentifier: .height) { types.insert(height) }
        return types
    }

    private var bodyMass: HKQuantityType { HKQuantityType.quantityType(forIdentifier: .bodyMass)! }
    private var shareTypes: Set<HKSampleType> { [bodyMass] }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    // HealthKit never reveals whether READ access was granted -- a denied type
    // simply returns no samples, by design, so an app cannot infer what the
    // user chose. Resolving here means "the sheet was shown", not "granted".
    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Apple Health is not available on this device", "unavailable")
            return
        }
        store.requestAuthorization(toShare: shareTypes, read: readTypes.union(profileTypes)) { ok, error in
            if let error {
                call.reject(error.localizedDescription, "auth_failed")
            } else {
                call.resolve(["requested": ok])
            }
        }
    }

    // read({ startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' }), both inclusive.
    @objc func read(_ call: CAPPluginCall) {
        guard let start = Self.parseDate(call.getString("startDate")),
              let endDay = Self.parseDate(call.getString("endDate")),
              let end = Calendar.current.date(byAdding: .day, value: 1, to: endDay),
              start < end else {
            call.reject("startDate and endDate must be YYYY-MM-DD, start on or before end", "invalid_range")
            return
        }

        let group = DispatchGroup()
        var steps: [[String: Any]] = []
        var weights: [[String: Any]] = []
        var workouts: [[String: Any]] = []

        group.enter()
        readSteps(start: start, end: end) { steps = $0; group.leave() }
        group.enter()
        readWeights(start: start, end: end) { weights = $0; group.leave() }
        group.enter()
        readWorkouts(start: start, end: end) { workouts = $0; group.leave() }

        group.notify(queue: .main) {
            call.resolve(["steps": steps, "weights": weights, "workouts": workouts])
        }
    }

    // readProfile() -> { sex?, birthDate?, heightCm?, weightKg?, weightDate? }
    //
    // Whatever Health has; a field it does not have (or the client declined)
    // is simply absent, since HealthKit returns nothing rather than an error
    // for a denied read. Sex is 'male' or 'female' only, the two the target
    // estimate takes; any other value is left for the client to choose.
    @objc func readProfile(_ call: CAPPluginCall) {
        var out: [String: Any] = [:]
        if let sex = try? store.biologicalSex().biologicalSex {
            switch sex {
            case .female: out["sex"] = "female"
            case .male: out["sex"] = "male"
            default: break
            }
        }
        if let dob = try? store.dateOfBirthComponents(),
           let y = dob.year, let m = dob.month, let d = dob.day {
            out["birthDate"] = String(format: "%04d-%02d-%02d", y, m, d)
        }
        latestSample(.height, unit: .meterUnit(with: .centi)) { cm, _ in
            if let cm { out["heightCm"] = (cm * 10).rounded() / 10 }
            self.latestSample(.bodyMass, unit: .gramUnit(with: .kilo)) { kg, date in
                if let kg {
                    // Two places, not one: the form shows pounds, and 0.1 kg is 0.2 lb,
                    // so a one-place kg read Health's 168.6 lb back as 168.7.
                    out["weightKg"] = (kg * 100).rounded() / 100
                    if let date { out["weightDate"] = Self.dayFormatter.string(from: date) }
                }
                DispatchQueue.main.async { call.resolve(out) }
            }
        }
    }

    private func latestSample(_ id: HKQuantityTypeIdentifier, unit: HKUnit,
                              done: @escaping (Double?, Date?) -> Void) {
        guard let type = HKQuantityType.quantityType(forIdentifier: id) else { done(nil, nil); return }
        let newest = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let q = HKSampleQuery(sampleType: type, predicate: nil, limit: 1, sortDescriptors: [newest]) { _, samples, _ in
            guard let s = samples?.first as? HKQuantitySample else { done(nil, nil); return }
            done(s.quantity.doubleValue(for: unit), s.endDate)
        }
        store.execute(q)
    }

    // MARK: - Steps

    // A statistics collection, not a sum of raw samples: an iPhone and a Watch
    // both count the same walk, and only HealthKit's own merge (the number the
    // Health app shows) de-duplicates them. Summing samples would double it.
    private func readSteps(start: Date, end: Date, done: @escaping ([[String: Any]]) -> Void) {
        let cal = Calendar.current
        let anchor = cal.startOfDay(for: start)
        dailySums(.stepCount, unit: .count(), start: start, end: end, anchor: anchor) { stepDays in
            self.dailySums(.distanceWalkingRunning, unit: .mile(), start: start, end: end, anchor: anchor) { miles in
                var out: [[String: Any]] = []
                for (day, count) in stepDays.sorted(by: { $0.key < $1.key }) where count > 0 {
                    var row: [String: Any] = ["logged_date": day, "steps": Int(count.rounded())]
                    if let mi = miles[day], mi > 0 {
                        row["distance"] = (mi * 100).rounded() / 100
                    }
                    out.append(row)
                }
                done(out)
            }
        }
    }

    private func dailySums(_ id: HKQuantityTypeIdentifier, unit: HKUnit, start: Date, end: Date,
                           anchor: Date, done: @escaping ([String: Double]) -> Void) {
        guard let type = HKQuantityType.quantityType(forIdentifier: id) else { done([:]); return }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let query = HKStatisticsCollectionQuery(
            quantityType: type, quantitySamplePredicate: predicate,
            options: .cumulativeSum, anchorDate: anchor, intervalComponents: DateComponents(day: 1))
        query.initialResultsHandler = { _, results, _ in
            var out: [String: Double] = [:]
            results?.enumerateStatistics(from: start, to: end) { stats, _ in
                if let sum = stats.sumQuantity() {
                    out[Self.localDate(stats.startDate)] = sum.doubleValue(for: unit)
                }
            }
            done(out)
        }
        store.execute(query)
    }

    // MARK: - Weight

    // saveWeight({ kg, date: 'YYYY-MM-DD', time: 'HH:mm:ss' }) -> { id }
    //
    // Resolves with no id when the client has not allowed writing, rather than
    // failing: writing is a courtesy on top of the log, and the weigh-in is
    // already saved in Gardnr either way. A client connected before writing
    // existed is asked once, here, the first time it would matter.
    @objc func saveWeight(_ call: CAPPluginCall) {
        guard let kg = call.getDouble("kg"), kg > 0,
              let day = Self.parseDate(call.getString("date")) else {
            call.reject("kg and date are required", "invalid_weight")
            return
        }
        let at = Self.combine(day, time: call.getString("time"))
        let write = {
            guard self.store.authorizationStatus(for: self.bodyMass) == .sharingAuthorized else {
                call.resolve([:])
                return
            }
            let sample = HKQuantitySample(
                type: self.bodyMass,
                quantity: HKQuantity(unit: .gramUnit(with: .kilo), doubleValue: kg),
                start: at, end: at,
                metadata: [HKMetadataKeyWasUserEntered: true])
            self.store.save(sample) { ok, error in
                if ok { call.resolve(["id": sample.uuid.uuidString]) }
                else { call.reject(error?.localizedDescription ?? "save failed", "save_failed") }
            }
        }
        // Not authorizationStatus == .notDetermined: for an app that has been
        // through the permission sheet once, HealthKit reports a share type it
        // has never ASKED about as .sharingDenied, so that check never asked.
        // getRequestStatusForAuthorization is HealthKit's own answer to
        // "would the sheet have anything new to show?" -- here, write access
        // for a client who connected before writing existed.
        store.getRequestStatusForAuthorization(toShare: shareTypes, read: readTypes) { status, _ in
            if status == .shouldRequest {
                self.store.requestAuthorization(toShare: self.shareTypes, read: self.readTypes) { _, _ in write() }
            } else {
                write()
            }
        }
    }

    // writeStatus() -> { status: 'allowed' | 'off' | 'notAsked' }
    //
    // Whether Gardnr may write weigh-ins, for the settings switch. Write access,
    // unlike read access, is something HealthKit will report. 'notAsked' is
    // decided by getRequestStatusForAuthorization rather than by
    // authorizationStatus, which reports a never-asked type as denied (see
    // saveWeight) and would show the switch as blocked before anyone said no.
    @objc func writeStatus(_ call: CAPPluginCall) {
        if store.authorizationStatus(for: bodyMass) == .sharingAuthorized {
            call.resolve(["status": "allowed"])
            return
        }
        store.getRequestStatusForAuthorization(toShare: shareTypes, read: readTypes) { status, _ in
            call.resolve(["status": status == .shouldRequest ? "notAsked" : "off"])
        }
    }

    // deleteSample({ id }) -- only ever succeeds for a sample this app wrote;
    // HealthKit refuses to let an app delete another source's data, which is
    // exactly the guarantee wanted. A sample already gone is not an error.
    @objc func deleteSample(_ call: CAPPluginCall) {
        guard let raw = call.getString("id"), let uuid = UUID(uuidString: raw) else {
            call.reject("id is required", "invalid_id")
            return
        }
        let predicate = HKQuery.predicateForObject(with: uuid)
        store.deleteObjects(of: bodyMass, predicate: predicate) { ok, _, error in
            if ok { call.resolve([:]) }
            else { call.reject(error?.localizedDescription ?? "delete failed", "delete_failed") }
        }
    }

    // Every weigh-in, not a daily figure: the app keeps several per day and
    // averages them itself (src/utils/energyBalanceRead.js). The sample's UUID is
    // the dedupe key, stable for as long as the sample exists in Health.
    private func readWeights(start: Date, end: Date, done: @escaping ([[String: Any]]) -> Void) {
        guard let type = HKQuantityType.quantityType(forIdentifier: .bodyMass) else { done([]); return }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let query = HKSampleQuery(sampleType: type, predicate: predicate,
                                  limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, _ in
            // Gardnr's own weigh-ins are skipped. They came from a row that is
            // already in the log, and importing them back would show every
            // typed weigh-in twice -- once by hand, once "from Apple Health".
            let own = Bundle.main.bundleIdentifier
            let theirs = (samples as? [HKQuantitySample] ?? []).filter { $0.sourceRevision.source.bundleIdentifier != own }
            let rows: [[String: Any]] = theirs.map { s in
                let kg = s.quantity.doubleValue(for: .gramUnit(with: .kilo))
                return [
                    "logged_date": Self.localDate(s.startDate),
                    "weighed_at": Self.localTime(s.startDate),
                    "weight_kg": (kg * 100).rounded() / 100,
                    "external_id": s.uuid.uuidString,
                ]
            }
            done(rows)
        }
        store.execute(query)
    }

    // MARK: - Workouts

    // EVERY workout, under the name Apple's own apps give it. HealthKit has no
    // free-text title: a workout is one of ~80 activity types, and the Health
    // and Fitness apps name it from the type, so this table is what makes a
    // judo session read "Martial Arts" here exactly as it does on the Watch.
    //
    // The Bool is whether it counts toward the coach's cardio-minutes target.
    // Sustained elevated heart rate is the test: endurance, HIIT, combat, court
    // and field sports count; strength, mobility and recovery do not, so an
    // hour of yoga never reads as an hour of cardio. Everything is still
    // listed in the Log either way.
    //
    // A type missing here (Apple adds some most years) imports as "Workout",
    // not counted, rather than being dropped.
    private static let workoutTypes: [HKWorkoutActivityType: (String, Bool)] = {
        var t: [HKWorkoutActivityType: (String, Bool)] = [
            // Endurance
            .running: ("Running", true),
            .walking: ("Walking", true),
            .cycling: ("Cycling", true),
            .handCycling: ("Hand Cycling", true),
            .swimming: ("Swimming", true),
            .rowing: ("Rowing", true),
            .elliptical: ("Elliptical", true),
            .stairClimbing: ("Stair Climber", true),
            .stairs: ("Stairs", true),
            .stepTraining: ("Step Training", true),
            .hiking: ("Hiking", true),
            .crossCountrySkiing: ("Cross Country Skiing", true),
            .wheelchairWalkPace: ("Wheelchair Walk Pace", true),
            .wheelchairRunPace: ("Wheelchair Run Pace", true),
            .jumpRope: ("Jump Rope", true),
            .paddleSports: ("Paddling", true),
            .skatingSports: ("Skating", true),
            .waterFitness: ("Water Fitness", true),
            .trackAndField: ("Track and Field", true),
            // Interval and mixed
            .highIntensityIntervalTraining: ("HIIT", true),
            .mixedCardio: ("Mixed Cardio", true),
            .crossTraining: ("Cross Training", true),
            .fitnessGaming: ("Fitness Gaming", true),
            // Dance
            .cardioDance: ("Dance", true),
            .socialDance: ("Social Dance", true),
            // Combat
            .martialArts: ("Martial Arts", true),
            .boxing: ("Boxing", true),
            .kickboxing: ("Kickboxing", true),
            .wrestling: ("Wrestling", true),
            .fencing: ("Fencing", true),
            // Court and field
            .soccer: ("Soccer", true),
            .basketball: ("Basketball", true),
            .tennis: ("Tennis", true),
            .pickleball: ("Pickleball", true),
            .badminton: ("Badminton", true),
            .squash: ("Squash", true),
            .racquetball: ("Racquetball", true),
            .tableTennis: ("Table Tennis", true),
            .volleyball: ("Volleyball", true),
            .handball: ("Handball", true),
            .hockey: ("Hockey", true),
            .lacrosse: ("Lacrosse", true),
            .rugby: ("Rugby", true),
            .americanFootball: ("American Football", true),
            .australianFootball: ("Australian Football", true),
            .baseball: ("Baseball", true),
            .softball: ("Softball", true),
            .cricket: ("Cricket", true),
            .discSports: ("Disc Sports", true),
            .waterPolo: ("Water Polo", true),
            // Snow and water
            .downhillSkiing: ("Downhill Skiing", true),
            .snowboarding: ("Snowboarding", true),
            .snowSports: ("Snow Sports", true),
            .surfingSports: ("Surfing", true),
            .waterSports: ("Water Sports", true),
            // Strength: listed, not cardio
            .traditionalStrengthTraining: ("Traditional Strength Training", false),
            .functionalStrengthTraining: ("Functional Strength Training", false),
            .coreTraining: ("Core Training", false),
            .climbing: ("Climbing", false),
            .gymnastics: ("Gymnastics", false),
            // Mobility and recovery: listed, not cardio
            .yoga: ("Yoga", false),
            .pilates: ("Pilates", false),
            .barre: ("Barre", false),
            .flexibility: ("Flexibility", false),
            .taiChi: ("Tai Chi", false),
            .mindAndBody: ("Mind and Body", false),
            .cooldown: ("Cooldown", false),
            .preparationAndRecovery: ("Preparation and Recovery", false),
            // Low exertion: listed, not cardio
            .golf: ("Golf", false),
            .bowling: ("Bowling", false),
            .archery: ("Archery", false),
            .curling: ("Curling", false),
            .sailing: ("Sailing", false),
            .equestrianSports: ("Equestrian Sports", false),
            .fishing: ("Fishing", false),
            .hunting: ("Hunting", false),
            .play: ("Play", false),
            .other: ("Other", false),
        ]
        if #available(iOS 16.0, *) {
            t[.swimBikeRun] = ("Multisport", true)
            t[.transition] = ("Transition", false)
        }
        if #available(iOS 17.0, *) {
            t[.underwaterDiving] = ("Underwater Diving", false)
        }
        return t
    }()

    // The name Apple shows, which for the commonest workouts depends on WHERE:
    // "Indoor Run" and "Outdoor Run" are different sessions to the person who
    // did them, and a coach reading the Log should see which.
    static func workoutName(_ w: HKWorkout) -> (String, Bool) {
        let (base, cardio) = workoutTypes[w.workoutActivityType] ?? ("Workout", false)
        let indoor = (w.metadata?[HKMetadataKeyIndoorWorkout] as? NSNumber)?.boolValue
        switch w.workoutActivityType {
        // Apple shortens the name only when it knows the place: a workout the
        // Watch recorded is "Outdoor Run", one typed into Health is "Running".
        case .running, .walking, .cycling:
            guard let indoor else { return (base, cardio) }
            let short = [HKWorkoutActivityType.running: "Run", .walking: "Walk", .cycling: "Cycle"][w.workoutActivityType]!
            return ("\(indoor ? "Indoor" : "Outdoor") \(short)", cardio)
        case .swimming:
            let raw = (w.metadata?[HKMetadataKeySwimmingLocationType] as? NSNumber)?.intValue
            switch raw.flatMap(HKWorkoutSwimmingLocationType.init(rawValue:)) {
            case .pool: return ("Pool Swim", cardio)
            case .openWater: return ("Open Water Swim", cardio)
            default: return (base, cardio)
            }
        default:
            return (base, cardio)
        }
    }

    private func readWorkouts(start: Date, end: Date, done: @escaping ([[String: Any]]) -> Void) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let query = HKSampleQuery(sampleType: .workoutType(), predicate: predicate,
                                  limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, _ in
            var rows: [[String: Any]] = []
            for w in samples as? [HKWorkout] ?? [] {
                let minutes = Int((w.duration / 60).rounded())
                guard minutes > 0 else { continue }
                let (name, cardio) = Self.workoutName(w)
                var row: [String: Any] = [
                    "logged_date": Self.localDate(w.startDate),
                    "exercise_type": name,
                    "duration": minutes,
                    "counts_as_cardio": cardio,
                    "external_id": w.uuid.uuidString,
                ]
                if let kcal = Self.calories(w) { row["calories_burned"] = Int(kcal.rounded()) }
                if let (avg, max) = Self.heartRate(w) {
                    row["avg_heart_rate"] = Int(avg.rounded())
                    if let max { row["max_heart_rate"] = Int(max.rounded()) }
                }
                if let mi = Self.distanceMiles(w), mi > 0 { row["distance"] = (mi * 100).rounded() / 100 }
                if let by = Self.recordedBy(w) { row["recorded_by"] = by }
                rows.append(row)
            }
            done(rows)
        }
        store.execute(query)
    }

    private static func calories(_ w: HKWorkout) -> Double? {
        if #available(iOS 16.0, *),
           let type = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned),
           let sum = w.statistics(for: type)?.sumQuantity() {
            return sum.doubleValue(for: .kilocalorie())
        }
        return legacyEnergy(w)
    }

    // Only available as workout statistics from iOS 16. Older phones send no
    // heart rate rather than one computed by a second query per workout.
    private static func heartRate(_ w: HKWorkout) -> (Double, Double?)? {
        guard #available(iOS 16.0, *),
              let type = HKQuantityType.quantityType(forIdentifier: .heartRate),
              let stats = w.statistics(for: type),
              let avg = stats.averageQuantity() else { return nil }
        let bpm = HKUnit.count().unitDivided(by: .minute())
        return (avg.doubleValue(for: bpm), stats.maximumQuantity()?.doubleValue(for: bpm))
    }

    // The workout's own total, whatever it measured (running, cycling or
    // swimming distance), read off the workout so it needs no extra permission
    // per distance type.
    private static func distanceMiles(_ w: HKWorkout) -> Double? {
        legacyDistance(w)?.doubleValue(for: .mile())
    }

    // `totalEnergyBurned` and `totalDistance` are deprecated in favour of
    // per-type statistics, but they are the only way to reach a workout's
    // distance without asking for a permission per distance type, and the
    // only calories on iOS 15. Isolated in functions marked deprecated
    // themselves, so the build stays free of warnings.
    @available(iOS, deprecated: 18.0)
    private static func legacyEnergy(_ w: HKWorkout) -> Double? {
        w.totalEnergyBurned?.doubleValue(for: .kilocalorie())
    }
    @available(iOS, deprecated: 18.0)
    private static func legacyDistance(_ w: HKWorkout) -> HKQuantity? {
        w.totalDistance
    }

    // What recorded it, for display: the device ("Apple Watch") when there is
    // one, else the app ("Strava"). Nothing for a workout typed into the
    // Health app itself, which is the client's own entry, not a recording.
    private static func recordedBy(_ w: HKWorkout) -> String? {
        if let device = w.device?.name, !device.isEmpty { return device }
        let source = w.sourceRevision.source
        if source.bundleIdentifier.hasPrefix("com.apple.Health") { return nil }
        return source.name.isEmpty ? nil : source.name
    }

    // MARK: - Local dates

    private static func formatter(_ format: String) -> DateFormatter {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = format
        return f
    }

    private static let dayFormatter = formatter("yyyy-MM-dd")
    private static let timeFormatter = formatter("HH:mm:ss")

    static func localDate(_ d: Date) -> String { dayFormatter.string(from: d) }
    static func localTime(_ d: Date) -> String { timeFormatter.string(from: d) }
    static func parseDate(_ s: String?) -> Date? { s.flatMap { dayFormatter.date(from: $0) } }

    // A local day plus an optional 'HH:mm(:ss)', as one moment. Without a time
    // the weigh-in sits at noon, safely inside its day in every timezone.
    static func combine(_ day: Date, time: String?) -> Date {
        let parts = (time ?? "").split(separator: ":").compactMap { Int($0) }
        let cal = Calendar.current
        if parts.count >= 2 {
            return cal.date(bySettingHour: parts[0], minute: parts[1], second: parts.count > 2 ? parts[2] : 0, of: day) ?? day
        }
        return cal.date(bySettingHour: 12, minute: 0, second: 0, of: day) ?? day
    }
}
