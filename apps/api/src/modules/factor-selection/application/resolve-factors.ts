import type { FactorDto } from '@bioauth/contracts';
import { NotFoundError } from '../../../shared/errors';
import type { FactorCatalogReader } from '../../factor-catalogs/application/ports';

/** Факторы берутся из запроса или из сохранённого каталога. */
export async function resolveFactors(
  reader: FactorCatalogReader,
  source: { factors?: FactorDto[]; catalogId?: string },
): Promise<FactorDto[]> {
  if (source.factors) return source.factors;
  const factors = await reader.findFactors(source.catalogId!);
  if (!factors) throw new NotFoundError(`каталог ${source.catalogId} не найден`);
  return factors;
}
