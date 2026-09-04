import type { Session, User } from '@supabase/supabase-js'
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types/app'

type AuthState = {
  session: Session | null
  user: User | null
  profile: Profile | null
  /** True until the first session check resolves — guards must not redirect before that. */
  loading: boolean
  /** Set when an admin changes your role while you are signed in. */
  roleChanged: boolean

  initialise: () => () => void
  refreshProfile: () => Promise<Profile | null>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string) => Promise<{ needsConfirmation: boolean }>
  signInWithMagicLink: (email: string) => Promise<void>
  resetPassword: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  signOut: () => Promise<void>
  isAdmin: () => boolean
}

export const useAuth = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  loading: true,
  roleChanged: false,

  initialise: () => {
    void supabase.auth.getSession().then(async ({ data }) => {
      set({ session: data.session, user: data.session?.user ?? null })
      if (data.session) await get().refreshProfile()
      set({ loading: false })
    })

    const { data: subscription } = supabase.auth.onAuthStateChange(async (event, session) => {
      set({ session, user: session?.user ?? null })
      if (event === 'SIGNED_OUT') {
        set({ profile: null, loading: false })
        return
      }
      if (session) await get().refreshProfile()
      set({ loading: false })
    })

    return () => subscription.subscription.unsubscribe()
  },

  refreshProfile: async () => {
    const userId = get().session?.user.id ?? (await supabase.auth.getUser()).data.user?.id
    if (!userId) {
      set({ profile: null })
      return null
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (error || !data) {
      set({ profile: null })
      return null
    }

    const previous = get().profile
    set({
      profile: data,
      roleChanged: !!previous && previous.role !== data.role,
    })

    // A deactivated account keeps no access anywhere (App Flow §1).
    if (!data.is_active) {
      await supabase.auth.signOut()
      set({ profile: null, session: null, user: null })
    }
    return data
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    await get().refreshProfile()
  },

  signUp: async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (error) throw error
    // `handle_new_user` has created the profile with role 'staff'.
    if (data.session) await get().refreshProfile()
    return { needsConfirmation: !data.session }
  },

  signInWithMagicLink: async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/` },
    })
    if (error) throw error
  },

  resetPassword: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/profile`,
    })
    if (error) throw error
  },

  updatePassword: async (password) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, user: null, profile: null, roleChanged: false })
  },

  isAdmin: () => get().profile?.role === 'inventory_admin',
}))
