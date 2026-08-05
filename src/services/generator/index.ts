import { generateFileName } from './methods/generate-file-name';
import { generateOtpCode } from './methods/generate-otp';

const generator = {
  generateOTPCode: generateOtpCode,
  generateFileName
};

export default generator;
