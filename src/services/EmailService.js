import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import config from '../config/index.js'

// Initialize SES Client
const sesClient = new SESClient({
  region: config.awsRegion || 'us-east-1',
  credentials: {
    accessKeyId: config.awsAccessKeyId,
    secretAccessKey: config.awsSecretAccessKey,
  },
})

class EmailService {
  /**
   * Send verification email
   * @param {string} email - Email address to send to
   * @param {string} verificationToken - Token for email verification
   */
  async sendVerificationEmail(email, verificationToken) {
    const verificationLink = `${config.clientUrl}/verify-email?token=${verificationToken}`

    const htmlBody = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              color: #333; 
              background-color: #f5f5f5;
              margin: 0;
              padding: 0;
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              padding: 20px; 
            }
            .email-wrapper {
              background-color: white;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
              overflow: hidden;
            }
            .header { 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
              color: white; 
              padding: 30px 20px; 
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
              font-weight: 600;
            }
            .content { 
              padding: 30px 20px; 
            }
            .content p {
              margin: 15px 0;
              line-height: 1.6;
              font-size: 16px;
            }
            .button { 
              display: inline-block; 
              background: #667eea; 
              color: white; 
              padding: 14px 32px; 
              text-decoration: none; 
              border-radius: 5px; 
              margin: 20px 0;
              font-weight: 600;
              transition: background 0.3s;
            }
            .button:hover {
              background: #764ba2;
            }
            .link-section {
              background-color: #f9f9f9;
              padding: 15px;
              border-radius: 5px;
              margin: 20px 0;
            }
            .link-section p {
              margin: 0;
              font-size: 14px;
              color: #666;
            }
            .link-section a {
              word-break: break-all;
              color: #667eea;
              font-weight: 600;
            }
            .warning {
              background-color: #fff3cd;
              border-left: 4px solid #ffc107;
              padding: 15px;
              margin: 20px 0;
              border-radius: 5px;
            }
            .warning p {
              margin: 0;
              font-size: 14px;
              color: #856404;
            }
            .footer { 
              text-align: center; 
              padding: 20px; 
              color: #999; 
              font-size: 12px;
              border-top: 1px solid #eee;
            }
            .footer p {
              margin: 5px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="email-wrapper">
              <div class="header">
                <h1>🎉 Welcome to TixChat!</h1>
              </div>
              <div class="content">
                <p>Hi there!</p>
                <p>Thank you for signing up for <strong>TixChat</strong>. We're excited to have you on board!</p>
                
                <p>To get started, please verify your email address by clicking the button below:</p>
                
                <center>
                  <a href="${verificationLink}" class="button">✓ Verify Email Address</a>
                </center>
                
                <div class="link-section">
                  <p><strong>Or copy this link if the button doesn't work:</strong></p>
                  <a href="${verificationLink}">${verificationLink}</a>
                </div>
                
                <div class="warning">
                  <p><strong>⏰ Note:</strong> This verification link will expire in <strong>24 hours</strong>. If you didn't create a TixChat account, please ignore this email.</p>
                </div>
                
                <p>Once verified, you'll be able to:</p>
                <ul style="color: #666; line-height: 1.8;">
                  <li>✅ Chat with friends in real-time</li>
                  <li>✅ Create group conversations</li>
                  <li>✅ Manage your friends list</li>
                  <li>✅ Access all TixChat features</li>
                </ul>
                
                <p style="margin-top: 30px;">Best regards,<br><strong>The TixChat Team</strong></p>
              </div>
              <div class="footer">
                <p>&copy; 2024 TixChat. All rights reserved.</p>
                <p>This is an automated email, please do not reply.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `

    const textBody = `
Welcome to TixChat!

Thank you for signing up! Please verify your email address by clicking this link:

${verificationLink}

This link will expire in 24 hours.

Once verified, you'll be able to chat with friends, create group conversations, and enjoy all TixChat features.

If you didn't sign up for TixChat, please ignore this email.

Best regards,
The TixChat Team
    `

    try {
      const command = new SendEmailCommand({
        Source: config.emailFrom || 'noreply@tixchat.com',
        Destination: {
          ToAddresses: [email],
        },
        Message: {
          Subject: {
            Data: '📧 Verify Your TixChat Email Address',
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: htmlBody,
              Charset: 'UTF-8',
            },
            Text: {
              Data: textBody,
              Charset: 'UTF-8',
            },
          },
        },
      })

      await sesClient.send(command)
      console.log(`✅ Verification email sent to ${email}`)
      return { success: true, message: 'Verification email sent' }
    } catch (error) {
      console.error('❌ Error sending verification email:', error.message)
      throw new Error(`Failed to send verification email: ${error.message}`)
    }
  }

  /**
   * Send welcome email (after email verification)
   * @param {string} email - User's email
   * @param {string} fullName - User's full name
   */
  async sendWelcomeEmail(email, fullName) {
    const htmlBody = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              color: #333; 
              background-color: #f5f5f5;
              margin: 0;
              padding: 0;
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              padding: 20px; 
            }
            .email-wrapper {
              background-color: white;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
              overflow: hidden;
            }
            .header { 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
              color: white; 
              padding: 30px 20px; 
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
              font-weight: 600;
            }
            .content { 
              padding: 30px 20px; 
            }
            .content p {
              margin: 15px 0;
              line-height: 1.6;
              font-size: 16px;
            }
            .feature-box {
              background-color: #f0f4ff;
              border-left: 4px solid #667eea;
              padding: 15px;
              margin: 10px 0;
              border-radius: 5px;
            }
            .cta-button { 
              display: inline-block; 
              background: #667eea; 
              color: white; 
              padding: 14px 32px; 
              text-decoration: none; 
              border-radius: 5px; 
              margin: 20px 0;
              font-weight: 600;
              transition: background 0.3s;
            }
            .cta-button:hover {
              background: #764ba2;
            }
            .footer { 
              text-align: center; 
              padding: 20px; 
              color: #999; 
              font-size: 12px;
              border-top: 1px solid #eee;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="email-wrapper">
              <div class="header">
                <h1>✨ Email Verified Successfully!</h1>
              </div>
              <div class="content">
                <p>Hi <strong>${fullName}</strong>!</p>
                <p>Your email has been verified successfully. Your TixChat account is now fully active and ready to use!</p>
                
                <h3>You can now:</h3>
                
                <div class="feature-box">
                  ✅ Chat with friends in real-time
                </div>
                
                <div class="feature-box">
                  💬 Create group conversations
                </div>
                
                <div class="feature-box">
                  👥 Add and manage your friends
                </div>
                
                <div class="feature-box">
                  🚀 Enjoy all TixChat features
                </div>
                
                <p style="margin-top: 30px; text-align: center;">
                  <a href="${config.clientUrl}" class="cta-button">👉 Go to TixChat</a>
                </p>
                
                <p>If you have any questions or need help, feel free to contact our support team.</p>
                
                <p>Best regards,<br><strong>The TixChat Team</strong></p>
              </div>
              <div class="footer">
                <p>&copy; 2024 TixChat. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `

    try {
      const command = new SendEmailCommand({
        Source: config.emailFrom || 'noreply@tixchat.com',
        Destination: {
          ToAddresses: [email],
        },
        Message: {
          Subject: {
            Data: '✨ Welcome to TixChat!',
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: htmlBody,
              Charset: 'UTF-8',
            },
          },
        },
      })

      await sesClient.send(command)
      console.log(`✅ Welcome email sent to ${email}`)
    } catch (error) {
      console.error('❌ Error sending welcome email:', error.message)
      // Don't throw - email is secondary
    }
  }

  /**
   * Send password reset email
   * @param {string} email - User's email
   * @param {string} resetToken - Token for password reset
   */
  async sendPasswordResetEmail(email, resetToken) {
    const htmlBody = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              color: #333; 
              background-color: #f5f5f5;
              margin: 0;
              padding: 0;
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              padding: 20px; 
            }
            .email-wrapper {
              background-color: white;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
              overflow: hidden;
            }
            .header { 
              background: linear-gradient(135deg, #ff6b6b 0%, #ff8c42 100%); 
              color: white; 
              padding: 30px 20px; 
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
              font-weight: 600;
            }
            .content { 
              padding: 30px 20px; 
            }
            .content p {
              margin: 15px 0;
              line-height: 1.6;
              font-size: 16px;
            }
            .otp-box {
              background: linear-gradient(135deg, #ff6b6b 0%, #ff8c42 100%);
              color: white;
              padding: 25px;
              border-radius: 8px;
              text-align: center;
              margin: 25px 0;
              font-size: 32px;
              font-weight: bold;
              letter-spacing: 4px;
              font-family: 'Courier New', monospace;
            }
            .otp-label {
              font-size: 14px;
              color: #666;
              margin-bottom: 10px;
              font-weight: 600;
            }
            .warning { 
              background: #fff3cd; 
              border-left: 4px solid #ffc107; 
              padding: 15px; 
              margin: 20px 0;
              border-radius: 5px;
            }
            .warning p {
              margin: 0;
              color: #856404;
              font-weight: 600;
            }
            .info {
              background: #e7f3ff;
              border-left: 4px solid #2196F3;
              padding: 15px;
              margin: 20px 0;
              border-radius: 5px;
            }
            .info p {
              margin: 0;
              color: #1565c0;
              font-size: 14px;
              line-height: 1.6;
            }
            .footer { 
              text-align: center; 
              padding: 20px; 
              color: #999; 
              font-size: 12px;
              border-top: 1px solid #eee;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="email-wrapper">
              <div class="header">
                <h1>🔐 Reset Your Password</h1>
              </div>
              <div class="content">
                <p>Hi there!</p>
                <p>We received a request to reset your TixChat password. Use the verification code below to proceed:</p>
                
                <div class="otp-label">Your Verification Code</div>
                <div class="otp-box">${resetToken}</div>
                
                <div class="info">
                  <p><strong>💡 How to use:</strong></p>
                  <p>1. Go to the password reset page on TixChat<br>
                     2. Enter this 6-character code<br>
                     3. Create a new password<br>
                     4. Sign in with your new password</p>
                </div>
                
                <div class="warning">
                  <p>⏰ IMPORTANT: This code will expire in 15 minutes.</p>
                </div>
                
                <p style="font-size: 14px; color: #666;">
                  If you didn't request a password reset, you can safely ignore this email. Your account remains secure.
                </p>
                
                <p>Best regards,<br><strong>The TixChat Team</strong></p>
              </div>
              <div class="footer">
                <p>&copy; 2024 TixChat. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `

    try {
      const command = new SendEmailCommand({
        Source: config.emailFrom || 'noreply@tixchat.com',
        Destination: {
          ToAddresses: [email],
        },
        Message: {
          Subject: {
            Data: '🔐 Reset Your TixChat Password - Verification Code',
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: htmlBody,
              Charset: 'UTF-8',
            },
          },
        },
      })

      await sesClient.send(command)
      console.log(`✅ Password reset email sent to ${email}`)
    } catch (error) {
      console.error('❌ Error sending reset email:', error.message)
      throw error
    }
  }

  /**
   * Send email verification OTP
   * @param {string} email - User's email
   * @param {string} otp - One-time password (6 digits)
   * @param {string} fullName - User's full name
   */
  async sendEmailVerificationOtp(email, otp, fullName = 'User') {
    const htmlBody = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              color: #333; 
              background-color: #f5f5f5;
              margin: 0;
              padding: 0;
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              padding: 20px; 
            }
            .email-wrapper {
              background-color: white;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
              overflow: hidden;
            }
            .header { 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
              color: white; 
              padding: 30px 20px; 
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
              font-weight: 600;
            }
            .content { 
              padding: 30px 20px; 
            }
            .content p {
              margin: 15px 0;
              line-height: 1.6;
              font-size: 16px;
            }
            .otp-box {
              background-color: #f0f4ff;
              border: 2px solid #667eea;
              padding: 25px;
              text-align: center;
              border-radius: 8px;
              margin: 25px 0;
            }
            .otp-code {
              font-size: 42px;
              font-weight: 700;
              letter-spacing: 5px;
              color: #667eea;
              font-family: 'Courier New', monospace;
              margin: 10px 0;
            }
            .otp-expires {
              color: #856404;
              background-color: #fff3cd;
              border-left: 4px solid #ffc107;
              padding: 15px;
              margin: 20px 0;
              border-radius: 5px;
              font-size: 14px;
            }
            .footer { 
              text-align: center; 
              padding: 20px; 
              color: #999; 
              font-size: 12px;
              border-top: 1px solid #eee;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="email-wrapper">
              <div class="header">
                <h1>✉️ Email Verification Code</h1>
              </div>
              <div class="content">
                <p>Hi ${fullName},</p>
                <p>Thank you for signing up for <strong>TixChat</strong>! We're excited to have you on board.</p>
                
                <p>To verify your email address and complete your registration, please enter the following code:</p>
                
                <div class="otp-box">
                  <p style="margin: 0; color: #666; font-size: 14px;">Your Verification Code</p>
                  <div class="otp-code">${otp}</div>
                </div>
                
                <div class="otp-expires">
                  <p><strong>⏰ Important:</strong> This code will expire in 10 minutes. Please enter it as soon as possible.</p>
                </div>
                
                <p style="font-size: 14px; color: #666;">
                  <strong>Note:</strong> If you didn't sign up for TixChat, please ignore this email. Your email address will not be used without your confirmation.
                </p>
                
                <p>Best regards,<br><strong>The TixChat Team</strong></p>
              </div>
              <div class="footer">
                <p>&copy; 2024 TixChat. All rights reserved.</p>
                <p>This is an automated email, please do not reply.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `

    const textBody = `
Welcome to TixChat!

Hi ${fullName},

Thank you for signing up! To verify your email address, please enter the following code:

${otp}

This code will expire in 10 minutes.

If you didn't sign up for TixChat, please ignore this email.

Best regards,
The TixChat Team
    `

    try {
      const command = new SendEmailCommand({
        Source: config.emailFrom || 'noreply@tixchat.com',
        Destination: {
          ToAddresses: [email],
        },
        Message: {
          Subject: {
            Data: '📧 Your TixChat Verification Code: ' + otp,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: htmlBody,
              Charset: 'UTF-8',
            },
            Text: {
              Data: textBody,
              Charset: 'UTF-8',
            },
          },
        },
      })

      await sesClient.send(command)
      console.log(`✅ Email verification OTP sent to ${email}`)
      return { success: true, message: 'Verification code sent' }
    } catch (error) {
      console.error('❌ Error sending verification OTP email:', error.message)
      throw new Error(`Failed to send verification code: ${error.message}`)
    }
  }
}

export default new EmailService()
