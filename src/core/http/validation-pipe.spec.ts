import { ArgumentMetadata, HttpException, HttpStatus } from '@nestjs/common';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { createValidationPipe } from './validation-pipe';

class SampleDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsInt()
  limit?: number;
}

const META: ArgumentMetadata = { type: 'body', metatype: SampleDto, data: '' };

describe('createValidationPipe', () => {
  const pipe = createValidationPipe();

  it('accepts a valid payload and returns a class instance', async () => {
    const result = await pipe.transform({ title: 'Hello' }, META);
    expect(result).toBeInstanceOf(SampleDto);
    expect(result.title).toBe('Hello');
  });

  it('rejects a missing required field with 422 (VALIDATION_FAILED path)', async () => {
    expect.assertions(2);
    try {
      await pipe.transform({}, META);
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    }
  });

  it('rejects an unknown property with 422 (forbidNonWhitelisted = true)', async () => {
    expect.assertions(2);
    try {
      await pipe.transform({ title: 'Hello', hacker: 'drop table' }, META);
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    }
  });

  it('names the offending unknown property in the message (dev feedback on typos)', async () => {
    expect.assertions(1);
    try {
      await pipe.transform({ title: 'Hello', titel: 'typo' }, META);
    } catch (error) {
      const body = (error as HttpException).getResponse() as { message: string[] };
      expect(body.message.join(' ')).toContain('titel');
    }
  });

  it('coerces types via implicit conversion (query string -> number)', async () => {
    const result = await pipe.transform({ title: 'Hello', limit: '25' }, META);
    expect(result.limit).toBe(25);
    expect(typeof result.limit).toBe('number');
  });

  it('surfaces the constraint text in the message array', async () => {
    expect.assertions(1);
    try {
      await pipe.transform({ title: '' }, META);
    } catch (error) {
      const body = (error as HttpException).getResponse() as { message: string[] };
      expect(body.message.join(' ')).toContain('title');
    }
  });
});
