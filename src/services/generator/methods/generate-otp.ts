import * as otp from 'otp-generator';

export const generateOtpCode = (len: number): string => {
  const otpCode = otp.generate(len, {
    lowerCaseAlphabets: false,
    upperCaseAlphabets: false,
    specialChars: false,
  });
  return otpCode;
};
