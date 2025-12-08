exports.generateForgotPasswordEmail = (resetUrl) => {
    // Define colors for easy maintenance
    const primaryColor = '#5D5FEF'; 
    const textColor = '#343a40';
    const subTextColor = '#6c757d';
    const backgroundColor = '#f7f9fc';
    const containerBg = '#ffffff';
    const fallbackBg = '#e9ecef';

   return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Password Reset</title>
    </head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'; background-color: ${backgroundColor}; color: ${textColor}; margin: 0; padding: 0; line-height: 1.6;">
    
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0; padding: 0; background-color: ${backgroundColor};">
        <tr>
            <td align="center" style="padding: 40px 10px;">
                
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 500px; background-color: ${containerBg}; border-radius: 12px; box-shadow: 0 6px 20px rgba(0,0,0,0.05); border: 1px solid #e9ecef; overflow: hidden;">
                    <tr>
                        <td style="padding: 30px;">
                            
                            <h2 style="color: ${primaryColor}; text-align: center; margin: 0 0 25px 0; font-weight: 600; font-size: 24px;">
                                🔐 Password Reset Request
                            </h2>

                            <p style="font-size: 15px; margin: 0 0 15px 0;">Hello,</p>
                            <p style="font-size: 15px; margin: 0 0 15px 0;">We received a request to **reset your password** for your HRMS account. If you initiated this process, please click the button below to proceed.</p>
                            <p style="font-size: 15px; margin: 0 0 25px 0; text-align: center;">This link is valid for **10 minutes**.</p>

                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 25px auto;">
                                <tr>
                                    <td align="center" style="border-radius: 8px; background-color: ${primaryColor}; box-shadow: 0 4px 10px rgba(93, 95, 239, 0.3);">
                                        <a href="${resetUrl}" target="_blank" style="display: block; padding: 12px 28px; background-color: ${primaryColor}; color: #ffffff !important; text-decoration: none; font-weight: bold; border-radius: 8px; border: 1px solid ${primaryColor}; font-size: 16px;">
                                            Reset Password
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="font-size: 13px; color: ${subTextColor}; margin: 20px 0 5px 0;">If the button doesn’t work, copy and paste the following URL into your web browser:</p>
                            <p style="font-size: 12px; color: ${subTextColor}; word-break: break-all; background-color: ${fallbackBg}; padding: 10px; border-radius: 4px; margin: 10px 0;">
                                <a href="${resetUrl}" target="_blank" style="color: ${primaryColor}; text-decoration: none;">${resetUrl}</a>
                            </p>

                            <p style="font-size: 13px; color: ${subTextColor}; margin-top: 20px;">**Important:** If you did not request a password reset, please **ignore this email**. Your password will remain unchanged.</p>
                            
                        </td>
                    </tr>
                </table>

                <div style="text-align: center; margin-top: 30px; font-size: 11px; color: #adb5bd; padding: 0 20px;">
                    &copy; ${new Date().getFullYear()} HRMS. All rights reserved. | This is an automated email, please do not reply.
                </div>

            </td>
        </tr>
    </table>
</body>
</html>
  `;
};