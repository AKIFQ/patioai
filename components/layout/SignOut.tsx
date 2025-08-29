import React from 'react';
import { signout } from '@/app/(auth)/action';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Loader2, LogOut } from 'lucide-react';

export default function SignOut() {
  return (
    <div className="flex justify-center">
      <form action={signout}>
        <SubmitButton />
      </form>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="outline"
      disabled={pending}
      className="w-full h-14 text-red-600 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-700 dark:hover:text-red-300 transition-all duration-200 touch-manipulation"
      style={{ minHeight: '44px' }}
    >
      <LogOut className="h-4 w-4 mr-2" />
      {pending ? 'Signing out...' : 'Sign Out'}
    </Button>
  );
} 