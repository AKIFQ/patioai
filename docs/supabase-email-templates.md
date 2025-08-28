# Custom Supabase Email Templates

To enhance the user experience, configure these custom email templates in your Supabase dashboard:

## How to Configure

1. Go to your Supabase Dashboard → Authentication → Email Templates
2. Replace the default templates with the ones below
3. Make sure to update the `{{ .SiteURL }}` references to match your domain

## 1. Confirm Sign Up Email

**Subject:** `Welcome to PatioAI! Please confirm your email`

**Template:**
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to PatioAI</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; }
        .logo { color: white; font-size: 32px; font-weight: bold; margin-bottom: 10px; }
        .subtitle { color: rgba(255,255,255,0.9); font-size: 16px; }
        .content { padding: 40px 20px; }
        .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; margin: 20px 0; }
        .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 14px; border-top: 1px solid #e5e7eb; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">🏛️ PatioAI</div>
            <div class="subtitle">Group AI Chats Made Simple</div>
        </div>
        
        <div class="content">
            <h2 style="color: #1f2937; margin-bottom: 20px;">Welcome to PatioAI! 🎉</h2>
            
            <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
                Thank you for signing up! You're just one click away from joining our collaborative AI chat platform where teams create, share, and innovate together.
            </p>
            
            <p style="color: #4b5563; line-height: 1.6; margin-bottom: 30px;">
                Click the button below to confirm your email address and start creating AI-powered group conversations:
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="{{ .ConfirmationURL }}" class="button">Confirm Email Address</a>
            </div>
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
            </p>
        </div>
        
        <div class="footer">
            <p>© 2024 PatioAI. Made with ❤️ for better collaboration.</p>
            <p style="margin-top: 10px;">
                <a href="{{ .SiteURL }}" style="color: #667eea; text-decoration: none;">Visit PatioAI</a>
            </p>
        </div>
    </div>
</body>
</html>
```

## 2. Password Reset Email

**Subject:** `Reset your PatioAI password`

**Template:**
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Password - PatioAI</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; }
        .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 40px 20px; text-align: center; }
        .logo { color: white; font-size: 32px; font-weight: bold; margin-bottom: 10px; }
        .subtitle { color: rgba(255,255,255,0.9); font-size: 16px; }
        .content { padding: 40px 20px; }
        .button { display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; margin: 20px 0; }
        .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 14px; border-top: 1px solid #e5e7eb; }
        .security-note { background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">🏛️ PatioAI</div>
            <div class="subtitle">Password Reset Request</div>
        </div>
        
        <div class="content">
            <h2 style="color: #1f2937; margin-bottom: 20px;">Reset Your Password 🔐</h2>
            
            <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
                We received a request to reset the password for your PatioAI account. No worries - it happens to the best of us!
            </p>
            
            <p style="color: #4b5563; line-height: 1.6; margin-bottom: 30px;">
                Click the button below to create a new password:
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="{{ .ConfirmationURL }}" class="button">Reset Password</a>
            </div>
            
            <div class="security-note">
                <h4 style="color: #92400e; margin: 0 0 10px 0;">🛡️ Security Note</h4>
                <p style="color: #92400e; margin: 0; font-size: 14px;">
                    This link will expire in 1 hour for your security. If you didn't request this reset, please ignore this email and your password will remain unchanged.
                </p>
            </div>
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
                Need help? Reply to this email or contact our support team.
            </p>
        </div>
        
        <div class="footer">
            <p>© 2024 PatioAI. Keeping your account secure.</p>
            <p style="margin-top: 10px;">
                <a href="{{ .SiteURL }}" style="color: #f59e0b; text-decoration: none;">Visit PatioAI</a>
            </p>
        </div>
    </div>
</body>
</html>
```

## 3. Magic Link Email

**Subject:** `Your secure sign-in link for PatioAI`

**Template:**
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign In to PatioAI</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 20px; text-align: center; }
        .logo { color: white; font-size: 32px; font-weight: bold; margin-bottom: 10px; }
        .subtitle { color: rgba(255,255,255,0.9); font-size: 16px; }
        .content { padding: 40px 20px; }
        .button { display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; margin: 20px 0; }
        .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 14px; border-top: 1px solid #e5e7eb; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">🏛️ PatioAI</div>
            <div class="subtitle">Secure Sign-In Link</div>
        </div>
        
        <div class="content">
            <h2 style="color: #1f2937; margin-bottom: 20px;">Sign In to PatioAI ✨</h2>
            
            <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
                Ready to dive back into your AI-powered conversations? Use the secure link below to sign in instantly - no password required!
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="{{ .ConfirmationURL }}" class="button">Sign In Securely</a>
            </div>
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                This secure link will expire in 1 hour. If you didn't request this sign-in link, you can safely ignore this email.
            </p>
        </div>
        
        <div class="footer">
            <p>© 2024 PatioAI. Secure access made simple.</p>
            <p style="margin-top: 10px;">
                <a href="{{ .SiteURL }}" style="color: #10b981; text-decoration: none;">Visit PatioAI</a>
            </p>
        </div>
    </div>
</body>
</html>
```

## Configuration Steps

1. **Log into Supabase Dashboard**
2. **Navigate to Authentication → Email Templates**
3. **For each template:**
   - Select the template type (Confirm signup, Reset password, Magic link)
   - Replace the subject and HTML content with the templates above
   - Save changes

## Variables Available

- `{{ .ConfirmationURL }}` - The action URL for the email
- `{{ .SiteURL }}` - Your configured site URL
- `{{ .Email }}` - The user's email address
- `{{ .Token }}` - The verification token

## Testing

After setting up, test each email type:
1. Create a new account to test signup confirmation
2. Use "Forgot Password" to test password reset
3. Use magic link sign-in if implemented

The emails will now have a professional, branded appearance that matches your PatioAI design!
