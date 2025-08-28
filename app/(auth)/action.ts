'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient as createClient } from '@/lib/server/server';
import { redirect } from 'next/navigation';

interface AuthResponse {
  success: boolean;
  message: string;
}

const formDataSchemaSignin = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export async function login(formData: FormData): Promise<AuthResponse> {
  const supabase = await createClient();

  const result = formDataSchemaSignin.safeParse({
    email: formData.get('email'),
    password: formData.get('password')
  });

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    if (errors.email) {
      return {
        success: false,
        message: 'Please enter a valid email address'
      };
    }
    if (errors.password) {
      return {
        success: false,
        message: 'Password must be at least 6 characters long'
      };
    }
    return {
      success: false,
      message: 'Please check your input and try again'
    };
  }

  const { email, password } = result.data;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    // Enhanced error messages based on Supabase error types
    switch (error.message) {
      case 'Invalid login credentials':
        return {
          success: false,
          message: 'The email or password you entered is incorrect. Please try again.'
        };
      case 'Email not confirmed':
        return {
          success: false,
          message: 'Please check your email and click the confirmation link before signing in.'
        };
      case 'Too many requests':
        return {
          success: false,
          message: 'Too many sign-in attempts. Please wait a few minutes before trying again.'
        };
      default:
        return {
          success: false,
          message: 'Unable to sign in at this time. Please try again later.'
        };
    }
  }

  revalidatePath('/', 'layout');
  return {
    success: true,
    message: 'Welcome back! You\'ve been successfully signed in.'
  };
}

const formDataSchemaSignup = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().optional()
});

export async function signup(formData: FormData): Promise<AuthResponse> {
  const supabase = await createClient();

  const result = formDataSchemaSignup.safeParse({
    email: formData.get('email') ? String(formData.get('email')) : '',
    password: formData.get('password') ? String(formData.get('password')) : '',
    fullName: formData.get('fullName')
      ? String(formData.get('fullName'))
      : undefined
  });

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    if (errors.email) {
      return {
        success: false,
        message: 'Please enter a valid email address'
      };
    }
    if (errors.password) {
      return {
        success: false,
        message: 'Password must be at least 6 characters long'
      };
    }
    return {
      success: false,
      message: 'Please check your input and try again'
    };
  }

  const { email, password, fullName } = result.data;

  const { error } = await supabase.auth.signUp({
    email: email,
    password: password,
    options: {
      data: { full_name: fullName ?? 'default_user' }
    }
  });

  if (error) {
    console.error('Signup error:', error);
    
    // Enhanced error messages based on Supabase error types
    switch (error.message) {
      case 'User already registered':
        return {
          success: false,
          message: 'An account with this email already exists. Try signing in instead.'
        };
      case 'Password should be at least 6 characters':
        return {
          success: false,
          message: 'Your password must be at least 6 characters long. Please choose a stronger password.'
        };
      case 'Signup is disabled':
        return {
          success: false,
          message: 'New account creation is currently disabled. Please contact support.'
        };
      case 'Invalid email':
        return {
          success: false,
          message: 'Please enter a valid email address.'
        };
      default:
        return {
          success: false,
          message: 'Unable to create your account at this time. Please try again later.'
        };
    }
  }

  return {
    success: true,
    message: '🎉 Account created successfully! Please check your email to verify your account before signing in.'
  };
}

const formDataSchemaReset = z.object({
  email: z.string().email()
});

export async function resetPasswordForEmail(
  formData: FormData
): Promise<AuthResponse> {
  const supabase = await createClient();
  const email = formData.get('email') ? String(formData.get('email')) : '';

  const result = formDataSchemaReset.safeParse({ email: email });

  if (!result.success) {
    return {
      success: false,
      message: 'Please enter a valid email address'
    };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.patioai.chat'}/auth/reset-password`
  });

  if (error) {
    console.error('Password reset error:', error);
    
    switch (error.message) {
      case 'User not found':
        return {
          success: false,
          message: 'No account found with this email address. Please check your email or sign up for a new account.'
        };
      case 'Email rate limit exceeded':
        return {
          success: false,
          message: 'Too many password reset requests. Please wait a few minutes before trying again.'
        };
      default:
        return {
          success: false,
          message: 'Unable to send password reset email at this time. Please try again later.'
        };
    }
  }

  return {
    success: true,
    message: '📧 Password reset link sent! Check your email and click the link to reset your password.'
  };
}

export async function signout() {
  const supabase = await createClient();

  const signOutResult = await supabase.auth.signOut();

  if (signOutResult.error) {
    redirect('/signin?error=' + encodeURIComponent('Logout error'));
  } else {
    redirect('/signin');
  }
}
