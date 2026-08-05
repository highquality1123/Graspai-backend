import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { S3 } from 'aws-sdk';

@Injectable()
export class S3Service {
  private s3: S3;
  private AWS_S3_BUCKET = process.env.S3_BUCKET_NAME as string;
  private AWS_S3_REGION = process.env.S3_REGION as string;

  constructor() {
    this.s3 = new S3({
      accessKeyId: process.env.S3_ACCESS_KEY as string,
      secretAccessKey: process.env.S3_SECRET_KEY as string,
    });
  }

  public buildUrlByFileName(fileName: string) {
    return `https://${this.AWS_S3_BUCKET}.s3.${this.AWS_S3_REGION}.amazonaws.com/${fileName}`;
  }

  public uploadFile(file: any, name: string) {
    return this.s3
      .upload({
        Bucket: this.AWS_S3_BUCKET,
        Key: name,
        Body: file.buffer,
        ContentType: file.mimetype,
      })
      .promise();
  }

  public async deleteFile(fileUrl: string) {
    try {
      const fileName = fileUrl.split('/').pop();
      const params = {
        Bucket: process.env.S3_BUCKET_NAME as string,
        Key: fileName,
      };
      const s3Response = await this.s3.deleteObject(params).promise();
      console.log('[S3] DELETE Document Resp: ', s3Response);
      return s3Response;
    } catch (error) {
      throw new HttpException(error.message, error.status || HttpStatus.BAD_REQUEST);
    }
  }

  public async deleteFiles(filesUrls: string[]) {
    try {
      const filesKeys = filesUrls.map(fileUrl => {
        return {
          Key: fileUrl.split('/').pop()
        };
      });
      const params = {
        Bucket: process.env.S3_BUCKET_NAME as string,
        Delete: {
          Objects: filesKeys
        },
      };
      const s3Response = await this.s3.deleteObjects(params).promise();
      console.log('[S3] DELETE Documents Resp: ', s3Response);
      return s3Response;
    } catch (error) {
      throw new HttpException(error.message, error.status || HttpStatus.BAD_REQUEST);
    }
  }

}
