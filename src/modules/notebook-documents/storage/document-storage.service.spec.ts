import { DocumentStorageService } from './document-storage.service';

describe('DocumentStorageService.keyFromUrl', () => {
  const savedBucket = process.env.S3_BUCKET_NAME;
  const savedRegion = process.env.S3_REGION;

  beforeEach(() => {
    process.env.S3_BUCKET_NAME = 'bucket';
    process.env.S3_REGION = 'eu-west-1';
  });
  afterAll(() => {
    if (savedBucket !== undefined) process.env.S3_BUCKET_NAME = savedBucket;
    else delete process.env.S3_BUCKET_NAME;
    if (savedRegion !== undefined) process.env.S3_REGION = savedRegion;
    else delete process.env.S3_REGION;
  });

  it('extracts the key from one of our S3 urls (round-trips urlFor)', () => {
    const s = new DocumentStorageService();
    const url = s.urlFor('abc123.pdf');
    expect(s.keyFromUrl(url)).toBe('abc123.pdf');
  });

  it('returns null for a YouTube url (video document, no S3 object to delete)', () => {
    expect(new DocumentStorageService().keyFromUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
  });

  it('returns null for a null url and for a foreign S3 host', () => {
    const s = new DocumentStorageService();
    expect(s.keyFromUrl(null)).toBeNull();
    expect(s.keyFromUrl('https://other-bucket.s3.eu-west-1.amazonaws.com/key.pdf')).toBeNull();
  });
});
