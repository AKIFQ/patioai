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
      variant="ghost"
      disabled={pending}
      className="w-full h-14 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-700 dark:hover:text-red-300 transition-all duration-300 touch-manipulation group border border-transparent hover:border-red-200/50 dark:hover:border-red-800/50 rounded-lg"
      style={{ minHeight: '44px' }}
    >
      <LogOut className="h-4 w-4 mr-2 transition-transform duration-300 group-hover:translate-x-1" />
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Signing out...
        </>
      ) : (
        'Sign Out'
      )}
    </Button>
  );
} 