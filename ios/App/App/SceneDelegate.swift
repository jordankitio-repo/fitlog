import UIKit
import WebKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // A Quick Action that LAUNCHED the app arrives here, before the web
        // view exists. Hold it so the bridge can hand it over at page start.
        QuickActions.pending = connectionOptions.shortcutItem?.type

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = GardnrBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    // A Quick Action while the app was already running (in the background):
    // the page is loaded, so it is delivered as an event.
    func windowScene(_ windowScene: UIWindowScene,
                     performActionFor shortcutItem: UIApplicationShortcutItem,
                     completionHandler: @escaping (Bool) -> Void) {
        let webView = (window?.rootViewController as? CAPBridgeViewController)?.webView
        completionHandler(QuickActions.deliver(shortcutItem.type, to: webView))
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

// Home screen Quick Actions (Info.plist UIApplicationShortcutItems), handed to
// the web app, which owns the routing (src/utils/quickActions.js). Two paths,
// because the page may or may not exist yet:
//   cold launch -- a script injected at document start sets
//                  window.__gardnrQuickAction, read once on boot;
//   already running -- a `gardnr:quick-action` event on window.
// No plugin: the app needs nothing back from the page, only to tell it once.
enum QuickActions {
    static var pending: String?

    // Only a known type, quoted as JSON, ever reaches JavaScript.
    static func jsLiteral(_ type: String) -> String? {
        guard type.hasPrefix("fit.gardnr.app."),
              let data = try? JSONSerialization.data(withJSONObject: [type]),
              let array = String(data: data, encoding: .utf8) else { return nil }
        return String(array.dropFirst().dropLast())
    }

    static func deliver(_ type: String, to webView: WKWebView?) -> Bool {
        guard let webView, let literal = jsLiteral(type) else { return false }
        webView.evaluateJavaScript(
            "window.dispatchEvent(new CustomEvent('gardnr:quick-action', { detail: \(literal) }))"
        )
        return true
    }
}

class GardnrBridgeViewController: CAPBridgeViewController {
    // Runs once the web view exists and before the start page loads, which
    // is the moment a launch-time Quick Action can be put where the page will
    // find it.
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        // A plugin compiled into the app, not an npm package, is never found
        // by Capacitor's auto-registration and has to be handed over by hand.
        bridge?.registerPluginInstance(HealthPlugin())
        bridge?.registerPluginInstance(AppearancePlugin())
        guard let type = QuickActions.pending, let literal = QuickActions.jsLiteral(type) else { return }
        QuickActions.pending = nil
        // The id makes it single-use: a user script re-runs on any reload of
        // the web view, and the page records which id it has already acted on.
        let id = UUID().uuidString
        let script = WKUserScript(source: "window.__gardnrQuickAction = { type: \(literal), id: '\(id)' };",
                                  injectionTime: .atDocumentStart, forMainFrameOnly: true)
        webView?.configuration.userContentController.addUserScript(script)
    }
}

// The app's own light/dark choice, applied to the native window. The page can
// be set to light while the phone is in dark mode (Profile > Appearance), and
// without this iOS kept drawing the status bar and every system sheet for the
// PHONE's appearance: white clock and battery on a light page.
@objc(AppearancePlugin)
public class AppearancePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppearancePlugin"
    public let jsName = "Appearance"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setStyle", returnType: CAPPluginReturnPromise),
    ]

    // setStyle({ theme: 'light' | 'dark' | 'auto' }). 'auto' follows the phone.
    @objc func setStyle(_ call: CAPPluginCall) {
        let theme = call.getString("theme")
        let style: UIUserInterfaceStyle = theme == "light" ? .light : theme == "dark" ? .dark : .unspecified
        DispatchQueue.main.async {
            self.bridge?.viewController?.view.window?.overrideUserInterfaceStyle = style
            self.bridge?.viewController?.setNeedsStatusBarAppearanceUpdate()
            call.resolve()
        }
    }
}

