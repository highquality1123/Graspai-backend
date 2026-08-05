import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/**
 * Stockage S3 des fichiers bruts de documents (V2). Mêmes variables d'env `S3_*` que le legacy
 * (`s3.service.ts`) mais client aws-sdk v3 — le legacy reste sur v2 et ne bouge pas.
 * Conformément à la philosophie du socle (`src/config/validation`), les `S3_*` ne sont pas
 * requises au boot : la feature échoue proprement à l'usage si la config manque.
 */
@Injectable()
export class DocumentStorageService {
  private readonly bucket = process.env.S3_BUCKET_NAME;
  private readonly region = process.env.S3_REGION;
  private client?: S3Client;

  /** URL publique, construite comme le legacy (`s3.service.ts:17-19`) — stockée dans `documents.url`. */
  urlFor(key: string): string {
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  /**
   * Clé S3 depuis une URL `documents.url` — ou `null` si l'URL n'est pas une des nôtres
   * (ex. une URL YouTube pour un document vidéo : pas d'objet S3 à supprimer).
   */
  keyFromUrl(url: string | null): string | null {
    if (!url || !this.bucket || !this.region) return null;
    const prefix = `https://${this.bucket}.s3.${this.region}.amazonaws.com/`;
    return url.startsWith(prefix) ? url.slice(prefix.length) : null;
  }

  /** Upload du fichier brut ; retourne l'URL publique à persister. */
  async put(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.getClient().send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
    return this.urlFor(key);
  }

  /**
   * Retélécharge le fichier brut. Nécessaire car l'extraction tourne dans le WORKER, après
   * la requête HTTP : le buffer multer n'existe plus au moment du job.
   */
  async get(key: string): Promise<Buffer> {
    const res = await this.getClient().send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) {
      throw new InternalServerErrorException({
        message: `Empty S3 object body for key ${key}`,
        code: 'STORAGE_READ_FAILED',
      });
    }
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    await this.getClient().send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  private getClient(): S3Client {
    const accessKeyId = process.env.S3_ACCESS_KEY;
    const secretAccessKey = process.env.S3_SECRET_KEY;
    if (!this.bucket || !this.region || !accessKeyId || !secretAccessKey) {
      throw new InternalServerErrorException({
        message: 'Document storage is not configured',
        code: 'STORAGE_NOT_CONFIGURED',
      });
    }
    this.client ??= new S3Client({ region: this.region, credentials: { accessKeyId, secretAccessKey } });
    return this.client;
  }
}
