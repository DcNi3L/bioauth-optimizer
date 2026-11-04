import { type ScoreDatasetDto, scoreDatasetSchema } from '@bioauth/contracts';
import { Body, Controller, Get, HttpCode, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ValidationError } from '../../../shared/errors';
import { UuidPipe } from '../../../shared/http/zod-validation.pipe';
import { ApiZodOk } from '../../../shared/swagger/api-zod';
import { GetScoreDatasetUseCase, UploadScoreDatasetUseCase } from '../application/score-dataset.use-cases';

@ApiTags('Наборы оценок')
@Controller('score-datasets')
export class ScoreDatasetsController {
  constructor(
    private readonly upload: UploadScoreDatasetUseCase,
    private readonly getDataset: GetScoreDatasetUseCase,
  ) {}

  @Post()
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Загрузка CSV с оценками сходства (колонки score,label)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' }, name: { type: 'string' } },
    },
  })
  @ApiZodOk(scoreDatasetSchema)
  create(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { name?: unknown } | undefined,
  ): Promise<ScoreDatasetDto> {
    if (!file) throw new ValidationError('нужно приложить файл в поле file', 'file');
    const name = typeof body?.name === 'string' ? body.name : undefined;
    return this.upload.execute({ originalFilename: file.originalname, content: file.buffer, name });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Метаданные и гистограмма набора оценок' })
  @ApiZodOk(scoreDatasetSchema)
  get(@Param('id', UuidPipe) id: string): Promise<ScoreDatasetDto> {
    return this.getDataset.execute(id);
  }
}
