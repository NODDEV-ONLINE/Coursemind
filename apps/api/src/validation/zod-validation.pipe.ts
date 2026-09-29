import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Reusable, hand-rolled Zod validation pipe (CLAUDE.md §4: "Validate all external
 * input with Zod at the boundary"). Deliberately avoids class-validator /
 * class-transformer — schemas live in colocated `*.schema.ts` files.
 *
 * Usage: `@Body(new ZodValidationPipe(createCourseSchema)) body: CreateCourseInput`
 * or `@Param('id', new ZodValidationPipe(courseIdSchema)) id: string`.
 */
export class ZodValidationPipe<TOutput> implements PipeTransform<unknown, TOutput> {
  constructor(private readonly schema: ZodType<TOutput>) {}

  transform(value: unknown): TOutput {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const message = result.error.issues.map(
        (i) => `${i.path.join('.') || '(value)'}: ${i.message}`,
      );
      throw new BadRequestException({ error: 'ValidationError', message });
    }
    return result.data;
  }
}
