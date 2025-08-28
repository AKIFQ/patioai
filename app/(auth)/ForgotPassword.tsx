import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useFormStatus } from 'react-dom';
import { resetPasswordForEmail } from './action';
import { usePathname } from 'next/navigation';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface ForgotPasswordProps {
  open: boolean;
  handleClose: () => void;
}

export default function ForgotPassword({
  open,
  handleClose
}: ForgotPasswordProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const currentPathname = usePathname();

  const handleSubmit = async (formData: FormData) => {
    formData.append('currentPathname', currentPathname);
    if (email.trim() === '') {
      setError('Email address is required');
      return;
    }
    
    try {
      const result = await resetPasswordForEmail(formData);
      
      if (result.success) {
        toast.success(result.message, {
          icon: <CheckCircle className="h-4 w-4" />,
          duration: 6000,
        });
        setError('');
        setEmail('');
        handleClose(); // Close the dialog on success
      } else {
        toast.error(result.message, {
          icon: <AlertCircle className="h-4 w-4" />,
          duration: 5000,
        });
        setError(result.message);
      }
    } catch (error) {
      toast.error('Something went wrong. Please try again.', {
        icon: <AlertCircle className="h-4 w-4" />,
      });
      setError('Something went wrong. Please try again.');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose();
      }}
    >
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
        </DialogHeader>

        <form action={handleSubmit} noValidate className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Enter your account&apos;s email address, and we&apos;ll send you a
            link to reset your password.
          </p>

          <Input
            required
            id="email"
            name="email"
            placeholder="Email address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <SubmitButton />

          <div className="flex justify-end mt-2">
            <Button type="button" variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Continuing...' : 'Continue'}
    </Button>
  );
}
