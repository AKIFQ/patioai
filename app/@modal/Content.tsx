import React from 'react';

export default function Content() {
  return (
    <div className="flex flex-col self-center gap-8 max-w-[450px]">
      <div className="text-center">
        <h3 className="text-2xl font-bold mb-4">Welcome</h3>
        <p className="text-muted-foreground">
          Sign in to access your account and continue using the application.
        </p>
      </div>
    </div>
  );
}
