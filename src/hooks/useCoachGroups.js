import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

// The coach's groups and who is in each, with the writes that change them.
export function useCoachGroups(coachId, showToast) {
  const [groups, setGroups] = useState([])
  const [members, setMembers] = useState([]) // [{ group_id, client_id }]

  useEffect(() => {
    if (!coachId) return undefined
    let live = true
    Promise.all([
      supabase.from('coach_groups').select('id, name').eq('coach_id', coachId).order('name'),
      supabase.from('coach_group_members').select('group_id, client_id'),
    ]).then(([{ data: g, error: ge }, { data: m, error: me }]) => {
      if (!live) return
      if (ge || me) { console.error(ge || me); return }
      setGroups(g || [])
      setMembers(m || [])
    })
    return () => { live = false }
  }, [coachId])

  async function toggleMember(groupId, clientId, on) {
    const q = on
      ? supabase.from('coach_group_members').insert({ group_id: groupId, client_id: clientId })
      : supabase.from('coach_group_members').delete().eq('group_id', groupId).eq('client_id', clientId)
    const { error } = await q
    if (error) { showToast("Couldn't update the group. Try again.", 'error'); return }
    setMembers(prev => on ? [...prev, { group_id: groupId, client_id: clientId }] : prev.filter(m => !(m.group_id === groupId && m.client_id === clientId)))
  }

  // Resolves to the new group, or null.
  async function createGroup(name, clientId) {
    const clean = name.trim()
    if (!clean) return null
    if (groups.some(g => g.name.toLowerCase() === clean.toLowerCase())) { showToast('You already have a group with that name.', 'error'); return null }
    const { data, error } = await supabase.from('coach_groups').insert({ coach_id: coachId, name: clean }).select('id, name').single()
    if (error) { showToast("Couldn't create the group. Try again.", 'error'); return null }
    setGroups(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    if (clientId) await toggleMember(data.id, clientId, true)
    return data
  }

  async function deleteGroup(g) {
    const { error } = await supabase.from('coach_groups').delete().eq('id', g.id)
    if (error) { showToast("Couldn't delete the group. Try again.", 'error'); return false }
    setGroups(prev => prev.filter(x => x.id !== g.id))
    setMembers(prev => prev.filter(m => m.group_id !== g.id))
    return true
  }

  const groupsOf = (clientId) => groups.filter(g => members.some(m => m.group_id === g.id && m.client_id === clientId))

  return { groups, members, toggleMember, createGroup, deleteGroup, groupsOf }
}
