'use client';
import React, { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import ForgotPassword from '../ForgotPassword';
import { GoogleIcon } from '../CustomIcons';
import { login } from '../action';
import { signInWithGoogle } from '@/lib/auth/oauth';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { toast } from 'sonner';
import { validateEmail, debounce } from '@/lib/utils/validation';

export default function SignInCard() {
  const router = useRouter();
  const [email, setEmail] = useState(
    typeof window !== 'undefined'
      ? localStorage.getItem('rememberedEmail') ?? ''
      : ''
  );
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(
    typeof window !== 'undefined' && !!localStorage.getItem('rememberedEmail')
  );
  const [emailError, setEmailError] = useState(false);
  const [emailErrorMessage, setEmailErrorMessage] = useState('');
  const [emailValid, setEmailValid] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [passwordErrorMessage, setPasswordErrorMessage] = useState('');
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

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
    if (!validateInputs()) return;
    
    setIsSubmitting(true);
    
    try {
      const result = await login(formData);

      if (result.success) {
        // Show success toast
        toast.success(result.message, {
          icon: <CheckCircle className="h-4 w-4" />,
          duration: 3000,
        });

        if (rememberMe) {
          localStorage.setItem('rememberedEmail', email);
        } else {
          localStorage.removeItem('rememberedEmail');
        }
        
        // Small delay for better UX before redirect
        setTimeout(() => {
          // Check if there's a return URL (for room redirects)
          const urlParams = new URLSearchParams(window.location.search);
          const returnUrl = urlParams.get('returnUrl');
          if (returnUrl) {
            // Redirect to the return URL (room)
            window.location.href = returnUrl;
          } else {
            router.push('/chat');
          }
        }, 800);
      } else {
        // Show error toast
        toast.error(result.message, {
          icon: <AlertCircle className="h-4 w-4" />,
          duration: 5000,
        });
        
        setAlertMessage({
          type: 'error',
          message: result.message
        });

        // Clear alert message after 5 seconds
        setTimeout(() => {
          setAlertMessage({ type: '', message: '' });
        }, 5000);
      }
    } catch (error) {
      toast.error('Something went wrong. Please try again.', {
        icon: <AlertCircle className="h-4 w-4" />,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Real-time email validation
  const validateEmailField = useCallback(
    debounce((emailValue: string) => {
      const validation = validateEmail(emailValue);
      setEmailError(!validation.isValid);
      setEmailErrorMessage(validation.message);
      setEmailValid(validation.isValid);
    }, 300),
    []
  );

  const validateInputs = useCallback(() => {
    let isValid = true;
    
    // Email validation
    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) {
      setEmailError(true);
      setEmailErrorMessage(emailValidation.message);
      isValid = false;
    } else {
      setEmailError(false);
      setEmailErrorMessage('');
    }
    
    // Password validation
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

  // Handle email change with real-time validation
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    if (value.trim()) {
      validateEmailField(value);
    } else {
      setEmailError(false);
      setEmailErrorMessage('');
      setEmailValid(false);
    }
  };

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
            <div className="relative">
              <Input
                id="email"
                type="email"
                name="email"
                placeholder="Enter your email"
                autoComplete="email"
                required
                className={`h-9 pr-10 ${
                  emailError 
                    ? 'border-destructive' 
                    : emailValid && email 
                      ? 'border-green-500' 
                      : 'border-border/40'
                }`}
                value={email}
                onChange={handleEmailChange}
              />
              {email && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {emailValid ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : emailError ? (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  ) : null}
                </div>
              )}
            </div>
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
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                className={`h-9 pr-10 ${passwordError ? 'border-destructive' : 'border-border/40'}`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-9 w-9 px-0 py-0 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="sr-only">
                  {showPassword ? "Hide password" : "Show password"}
                </span>
              </Button>
            </div>
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
        onClick={async () => {
          setIsGoogleLoading(true);
          try {
            await signInWithGoogle();
            toast.success('Redirecting to Google...', {
              icon: <CheckCircle className="h-4 w-4" />,
              duration: 2000,
            });
          } catch (error) {
            toast.error('Failed to connect to Google. Please try again.', {
              icon: <AlertCircle className="h-4 w-4" />,
            });
            setIsGoogleLoading(false);
          }
        }}
        disabled={isGoogleLoading || isSubmitting}
        className="w-full h-9 gap-2 border-border/40"
      >
        {isGoogleLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <GoogleIcon />
        )}
        <span className="text-sm">
          {isGoogleLoading ? 'Connecting...' : 'Continue with Google'}
        </span>
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
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Signing in...</span>
        </div>
      ) : (
        <span className="text-sm font-medium">Sign in</span>
      )}
    </Button>
  );
}
