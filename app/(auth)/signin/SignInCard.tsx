'use client';
import React, { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import ForgotPassword from '../ForgotPassword';
import { GoogleIcon } from '../CustomIcons';
import { login } from '../action';
import { signInWithGoogle } from '@/lib/auth/oauth';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';

export default function SignInCard() {
  const router = useRouter();
  const [email, setEmail] = useState(
    typeof window !== 'undefined'
      ? localStorage.getItem('rememberedEmail') ?? ''
      : ''
  );
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(
    typeof window !== 'undefined' && !!localStorage.getItem('rememberedEmail')
  );
  const [emailError, setEmailError] = useState(false);
  const [emailErrorMessage, setEmailErrorMessage] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [passwordErrorMessage, setPasswordErrorMessage] = useState('');
  const [open, setOpen] = useState(false);

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const [alertMessage, setAlertMessage] = useState({
    type: '',
    message: ''
  });

  const handleSubmit = async (formData: FormData) => {
    if (validateInputs()) {
      const result = await login(formData);

      setAlertMessage({
        type: result.success ? 'success' : 'error',
        message: result.message
      });

      if (result.success) {
        if (rememberMe) {
          localStorage.setItem('rememberedEmail', email);
        } else {
          localStorage.removeItem('rememberedEmail');
        }
        router.push('/chat');
      }
    }
  };

  const validateInputs = useCallback(() => {
    let isValid = true;
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      setEmailError(true);
      setEmailErrorMessage('Please enter a valid email address.');
      isValid = false;
    } else {
      setEmailError(false);
      setEmailErrorMessage('');
    }
    if (!password.trim()) {
      setPasswordError(true);
      setPasswordErrorMessage('Password is required');
      isValid = false;
    } else {
      setPasswordError(false);
      setPasswordErrorMessage('');
    }
    return isValid;
  }, [email, password]);

  return (
    <div className="w-full max-w-sm bg-background/80 backdrop-blur-md border border-border/40 rounded-lg p-6 space-y-6 shadow-lg">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-medium">Welcome back</h2>
        <p className="text-sm text-muted-foreground/80">Sign in to continue to your chats</p>
      </div>

      <form
        action={handleSubmit}
        noValidate
        className="space-y-4"
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm font-medium">Email</Label>
            <Input
              id="email"
              type="email"
              name="email"
              placeholder="Enter your email"
              autoComplete="email"
              required
              className={`h-9 ${emailError ? 'border-destructive' : 'border-border/40'}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {emailError && (
              <p className="text-xs text-destructive/80">{emailErrorMessage}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <Label htmlFor="password" className="text-sm font-medium">Password</Label>
              <Button
                type="button"
                variant="ghost"
                onClick={handleClickOpen}
                className="h-auto p-0 text-xs text-muted-foreground/80 hover:text-foreground"
              >
                Forgot password?
              </Button>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Enter your password"
              autoComplete="current-password"
              required
              className={`h-9 ${passwordError ? 'border-destructive' : 'border-border/40'}`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {passwordError && (
              <p className="text-xs text-destructive/80">{passwordErrorMessage}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="remember-me"
            checked={rememberMe}
            onCheckedChange={(checked) => setRememberMe(checked === true)}
            className="h-4 w-4"
          />
          <Label
            htmlFor="remember-me"
            className="text-xs text-muted-foreground/80"
          >
            Remember me
          </Label>
        </div>

        <ForgotPassword open={open} handleClose={handleClose} />

        <SubmitButton />

        {alertMessage.type && (
          <Alert
            variant={
              alertMessage.type === 'error' ? 'destructive' : 'default'
            }
            className="py-2"
          >
            <AlertDescription className="text-xs">{alertMessage.message}</AlertDescription>
          </Alert>
        )}
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <Separator className="w-full opacity-40" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-background px-3 text-muted-foreground/60">or</span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={() => signInWithGoogle()}
        className="w-full h-9 gap-2 border-border/40"
      >
        <GoogleIcon />
        <span className="text-sm">Continue with Google</span>
      </Button>

      <div className="text-center">
        <span className="text-xs text-muted-foreground/80">
          Don't have an account?{' '}
          <Link 
            href="/signup" 
            className="font-medium text-foreground hover:text-primary transition-colors"
          >
            Sign up
          </Link>
        </span>
      </div>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full h-9" disabled={pending}>
      {pending ? (
        'Signing in...'
      ) : (
        <span className="text-sm font-medium">Sign in</span>
      )}
    </Button>
  );
}
