# Custom PatioAI Email Templates

Professional email templates that match your brand's sophisticated cream and forest green aesthetic.

## Brand Guidelines Used

- **Primary Colors**: Forest Green (#26413C) and Cream (#FFFFF0)
- **Dark Mode Aesthetic**: Deep forest tones with cream accents
- **Typography**: Clean, professional sans-serif
- **No Emojis**: Sophisticated, business-focused design
- **Logo**: PatioAI horizontal logo from `/public/logos/`

## How to Configure

1. Go to your Supabase Dashboard → Authentication → Email Templates
2. Replace the default templates with the ones below
3. Make sure to update the `{{ .SiteURL }}` to `https://www.patioai.chat`

## 1. Confirm Sign Up Email

**Subject:** `Welcome to PatioAI - Please confirm your email address`

**Template:**
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to PatioAI</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif; 
            background-color: #152722; 
            color: #FFFFF0; 
            line-height: 1.6;
        }
        .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background-color: #1A2E29; 
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        .header { 
            background: linear-gradient(135deg, #26413C 0%, #1A2E29 100%); 
            padding: 48px 32px; 
            text-align: center; 
            border-bottom: 1px solid #324F47;
        }
        .logo { 
            color: #FFFFF0; 
            font-size: 28px; 
            font-weight: 700; 
            letter-spacing: -0.5px;
            margin-bottom: 8px; 
        }
        .subtitle { 
            color: rgba(255, 255, 240, 0.7); 
            font-size: 16px; 
            font-weight: 400;
        }
        .content { 
            padding: 48px 32px; 
            background-color: #1F3530;
        }
        .content h2 { 
            color: #FFFFF0; 
            font-size: 24px; 
            font-weight: 600; 
            margin-bottom: 24px; 
            letter-spacing: -0.3px;
        }
        .content p { 
            color: rgba(255, 255, 240, 0.8); 
            font-size: 16px; 
            margin-bottom: 20px; 
            line-height: 1.7;
        }
        .button-container { 
            text-align: center; 
            margin: 40px 0; 
        }
        .button { 
            display: inline-block; 
            background: linear-gradient(135deg, #26413C 0%, #324F47 100%); 
            color: #FFFFF0; 
            text-decoration: none; 
            padding: 16px 32px; 
            border-radius: 8px; 
            font-weight: 600; 
            font-size: 16px;
            border: 1px solid rgba(255, 255, 240, 0.1);
            transition: all 0.2s ease;
        }
        .button:hover { 
            background: linear-gradient(135deg, #324F47 0%, #3A584E 100%);
            transform: translateY(-1px);
        }
        .footer { 
            padding: 32px; 
            text-align: center; 
            background-color: #152722;
            border-top: 1px solid #324F47;
        }
        .footer p { 
            color: rgba(255, 255, 240, 0.6); 
            font-size: 14px; 
            margin-bottom: 8px;
        }
        .footer a { 
            color: rgba(255, 255, 240, 0.8); 
            text-decoration: none; 
            font-weight: 500;
        }
        .footer a:hover { 
            color: #FFFFF0; 
        }
        .security-note {
            background-color: rgba(50, 79, 71, 0.3);
            border: 1px solid rgba(50, 79, 71, 0.5);
            border-radius: 8px;
            padding: 16px;
            margin-top: 32px;
        }
        .security-note p {
            color: rgba(255, 255, 240, 0.7);
            font-size: 14px;
            margin: 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">PatioAI</div>
            <div class="subtitle">Group AI Chats Made Simple</div>
        </div>
        
        <div class="content">
            <h2>Welcome to PatioAI</h2>
            
            <p>
                Thank you for joining our collaborative AI chat platform. You're one step away from accessing powerful AI conversations designed for teams and communities.
            </p>
            
            <p>
                To complete your account setup and start creating AI-powered group conversations, please confirm your email address by clicking the button below.
            </p>
            
            <div class="button-container">
                <a href="{{ .ConfirmationURL }}" class="button">Confirm Email Address</a>
            </div>
            
            <div class="security-note">
                <p>
                    <strong>Security Notice:</strong> This confirmation link will expire in 24 hours. If you didn't create a PatioAI account, you can safely ignore this email.
                </p>
            </div>
        </div>
        
        <div class="footer">
            <p>© 2024 PatioAI. AI collaboration platform.</p>
            <p><a href="{{ .SiteURL }}">Visit PatioAI</a></p>
        </div>
    </div>
</body>
</html>
```

## 2. Password Reset Email

**Subject:** `PatioAI Password Reset - Action Required`

**Template:**
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Password - PatioAI</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif; 
            background-color: #152722; 
            color: #FFFFF0; 
            line-height: 1.6;
        }
        .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background-color: #1A2E29; 
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        .header { 
            background: linear-gradient(135deg, #324F47 0%, #26413C 100%); 
            padding: 48px 32px; 
            text-align: center; 
            border-bottom: 1px solid #3A584E;
        }
        .logo { 
            color: #FFFFF0; 
            font-size: 28px; 
            font-weight: 700; 
            letter-spacing: -0.5px;
            margin-bottom: 8px; 
        }
        .subtitle { 
            color: rgba(255, 255, 240, 0.7); 
            font-size: 16px; 
            font-weight: 400;
        }
        .content { 
            padding: 48px 32px; 
            background-color: #1F3530;
        }
        .content h2 { 
            color: #FFFFF0; 
            font-size: 24px; 
            font-weight: 600; 
            margin-bottom: 24px; 
            letter-spacing: -0.3px;
        }
        .content p { 
            color: rgba(255, 255, 240, 0.8); 
            font-size: 16px; 
            margin-bottom: 20px; 
            line-height: 1.7;
        }
        .button-container { 
            text-align: center; 
            margin: 40px 0; 
        }
        .button { 
            display: inline-block; 
            background: linear-gradient(135deg, #26413C 0%, #324F47 100%); 
            color: #FFFFF0; 
            text-decoration: none; 
            padding: 16px 32px; 
            border-radius: 8px; 
            font-weight: 600; 
            font-size: 16px;
            border: 1px solid rgba(255, 255, 240, 0.1);
            transition: all 0.2s ease;
        }
        .button:hover { 
            background: linear-gradient(135deg, #324F47 0%, #3A584E 100%);
            transform: translateY(-1px);
        }
        .footer { 
            padding: 32px; 
            text-align: center; 
            background-color: #152722;
            border-top: 1px solid #324F47;
        }
        .footer p { 
            color: rgba(255, 255, 240, 0.6); 
            font-size: 14px; 
            margin-bottom: 8px;
        }
        .footer a { 
            color: rgba(255, 255, 240, 0.8); 
            text-decoration: none; 
            font-weight: 500;
        }
        .footer a:hover { 
            color: #FFFFF0; 
        }
        .security-warning {
            background-color: rgba(229, 62, 62, 0.1);
            border: 1px solid rgba(229, 62, 62, 0.3);
            border-radius: 8px;
            padding: 20px;
            margin: 32px 0;
        }
        .security-warning h4 {
            color: #E53E3E;
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .security-warning p {
            color: rgba(255, 255, 240, 0.8);
            font-size: 14px;
            margin: 0;
        }
        .help-section {
            background-color: rgba(50, 79, 71, 0.3);
            border-radius: 8px;
            padding: 16px;
            margin-top: 32px;
        }
        .help-section p {
            color: rgba(255, 255, 240, 0.7);
            font-size: 14px;
            margin: 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">PatioAI</div>
            <div class="subtitle">Password Reset Request</div>
        </div>
        
        <div class="content">
            <h2>Reset Your Password</h2>
            
            <p>
                We received a request to reset the password for your PatioAI account. If you initiated this request, click the button below to create a new password.
            </p>
            
            <p>
                For your security, this reset link is valid for one hour only. After that time, you'll need to request a new password reset.
            </p>
            
            <div class="button-container">
                <a href="{{ .ConfirmationURL }}" class="button">Reset Password</a>
            </div>
            
            <div class="security-warning">
                <h4>Security Notice</h4>
                <p>
                    If you did not request a password reset, please ignore this email. Your password will remain unchanged. Consider reviewing your account security if you receive multiple unexpected password reset requests.
                </p>
            </div>
            
            <div class="help-section">
                <p>
                    <strong>Need assistance?</strong> If you're having trouble accessing your account or didn't request this reset, please contact our support team for immediate assistance.
                </p>
            </div>
        </div>
        
        <div class="footer">
            <p>© 2024 PatioAI. Account security is our priority.</p>
            <p><a href="{{ .SiteURL }}">Visit PatioAI</a></p>
        </div>
    </div>
</body>
</html>
```

## 3. Magic Link Email (Optional)

**Subject:** `PatioAI Secure Sign-In Link`

**Template:**
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign In to PatioAI</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif; 
            background-color: #152722; 
            color: #FFFFF0; 
            line-height: 1.6;
        }
        .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background-color: #1A2E29; 
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        .header { 
            background: linear-gradient(135deg, #2B4A43 0%, #26413C 100%); 
            padding: 48px 32px; 
            text-align: center; 
            border-bottom: 1px solid #324F47;
        }
        .logo { 
            color: #FFFFF0; 
            font-size: 28px; 
            font-weight: 700; 
            letter-spacing: -0.5px;
            margin-bottom: 8px; 
        }
        .subtitle { 
            color: rgba(255, 255, 240, 0.7); 
            font-size: 16px; 
            font-weight: 400;
        }
        .content { 
            padding: 48px 32px; 
            background-color: #1F3530;
        }
        .content h2 { 
            color: #FFFFF0; 
            font-size: 24px; 
            font-weight: 600; 
            margin-bottom: 24px; 
            letter-spacing: -0.3px;
        }
        .content p { 
            color: rgba(255, 255, 240, 0.8); 
            font-size: 16px; 
            margin-bottom: 20px; 
            line-height: 1.7;
        }
        .button-container { 
            text-align: center; 
            margin: 40px 0; 
        }
        .button { 
            display: inline-block; 
            background: linear-gradient(135deg, #26413C 0%, #324F47 100%); 
            color: #FFFFF0; 
            text-decoration: none; 
            padding: 16px 32px; 
            border-radius: 8px; 
            font-weight: 600; 
            font-size: 16px;
            border: 1px solid rgba(255, 255, 240, 0.1);
            transition: all 0.2s ease;
        }
        .footer { 
            padding: 32px; 
            text-align: center; 
            background-color: #152722;
            border-top: 1px solid #324F47;
        }
        .footer p { 
            color: rgba(255, 255, 240, 0.6); 
            font-size: 14px; 
            margin-bottom: 8px;
        }
        .footer a { 
            color: rgba(255, 255, 240, 0.8); 
            text-decoration: none; 
            font-weight: 500;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">PatioAI</div>
            <div class="subtitle">Secure Sign-In Link</div>
        </div>
        
        <div class="content">
            <h2>Secure Access</h2>
            
            <p>
                Use the secure link below to sign in to your PatioAI account instantly. This passwordless authentication method provides enhanced security for your account.
            </p>
            
            <div class="button-container">
                <a href="{{ .ConfirmationURL }}" class="button">Sign In Securely</a>
            </div>
            
            <p style="color: rgba(255, 255, 240, 0.7); font-size: 14px;">
                This secure link will expire in 1 hour. If you didn't request this sign-in link, please ignore this email.
            </p>
        </div>
        
        <div class="footer">
            <p>© 2024 PatioAI. Secure access simplified.</p>
            <p><a href="{{ .SiteURL }}">Visit PatioAI</a></p>
        </div>
    </div>
</body>
</html>
```

## Email Configuration Summary

### **Design Principles Applied:**
- **Dark Mode Aesthetic**: Deep forest backgrounds (#152722, #1A2E29, #1F3530)
- **Brand Colors**: Forest Green (#26413C) primary, Cream (#FFFFF0) text
- **Professional Typography**: System fonts, proper hierarchy
- **No Emojis**: Clean, business-focused design
- **Accessibility**: High contrast, readable text sizes
- **Mobile Responsive**: Scales properly on all devices

### **Sender Configuration:**
For professional branding, use:
```
Sender Name: PatioAI
Sender Email: noreply@patioai.chat  (after domain verification)
OR
Sender Email: onboarding@resend.dev  (immediate setup)
```

## Setup Instructions

### **1. Configure Supabase SMTP:**
1. **Supabase Dashboard** → Authentication → Settings → SMTP Settings
2. **Enable custom SMTP**: ON
3. **SMTP Configuration**:
   ```
   Host: smtp.resend.com
   Port: 587
   User: resend
   Pass: [your-resend-api-key]
   ```

### **2. Update Email Templates:**
1. **Supabase Dashboard** → Authentication → Email Templates
2. **For each template type**, replace with the branded versions above
3. **Update Site URL** to `https://www.patioai.chat`

### **3. Test Email Flow:**
1. Create test account → Check confirmation email
2. Use "Forgot Password" → Check reset email
3. Verify professional appearance and functionality

### **Key Features:**
- ✅ **Brand Consistent**: Matches your app's design system
- ✅ **Professional**: No emojis, clean typography
- ✅ **Secure**: Clear security messaging and warnings
- ✅ **Accessible**: High contrast, readable design
- ✅ **Mobile Friendly**: Responsive layout

The emails now perfectly represent your sophisticated PatioAI brand!
