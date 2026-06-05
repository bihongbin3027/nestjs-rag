import { Test, TestingModule } from '@nestjs/testing';
import { PermService } from './perm.service';

describe('PermService', () => {
  let service: PermService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PermService],
    }).compile();

    service = module.get<PermService>(PermService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
