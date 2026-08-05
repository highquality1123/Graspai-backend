import { v4 } from 'uuid';

export const generateFileName = (fileOriginalName: string) => {
  const fileUUID = v4();
  const fileNameParts = fileOriginalName
    .trim()
    .replaceAll(' ', '_')
    .split('.');
  let fileExtension;
  if (fileNameParts.length > 1) {
    const removedParts = fileNameParts.splice(fileNameParts.length - 1, 1);
    fileExtension = removedParts[0];
  }
  let fileName = `${fileUUID}`;
  if (fileExtension) {
    fileName += `.${fileExtension}`;
  }
  return fileName;
};
