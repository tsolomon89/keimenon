import { DatabaseClient } from '@keimenon/db';
import type { ImportConfiguration, ImportJobStage } from '@keimenon/types';
import {
  EnhancedImportServiceV2,
  ImportConversation,
  ImportResult,
} from '../../services/import-enhanced-v2';
import { DatabaseWriteQueue } from '../../services/DatabaseWriteQueue';
import { ImportPipelineCompensationService } from './ImportPipelineCompensationService';
import { ImportPipelineStage } from './stages';

export interface ImportPipelineHooks {
  onStage?: (stage: ImportJobStage, message: string) => Promise<void> | void;
  onPipelineStage?: (stage: ImportPipelineStage, message: string) => Promise<void> | void;
}

export interface ImportPipelineRunnerInput {
  conversations: ImportConversation[];
  uploadHash: string;
  config: ImportConfiguration;
  context: { accountId: string; userId: string };
  hooks?: ImportPipelineHooks;
}

type ImportFailure = Error & {
  createdNodeIds?: string[];
  createdEdgeIds?: string[];
};

export class ImportPipelineRunner {
  private readonly importService: EnhancedImportServiceV2;
  private readonly compensationService: ImportPipelineCompensationService;

  constructor(
    private readonly dbClient: DatabaseClient,
    writeQueue?: DatabaseWriteQueue
  ) {
    this.importService = new EnhancedImportServiceV2(dbClient, writeQueue);
    this.compensationService = new ImportPipelineCompensationService(dbClient);
  }

  async run(input: ImportPipelineRunnerInput): Promise<ImportResult> {
    try {
      return await this.importService.import(
        input.conversations,
        input.uploadHash,
        input.config,
        input.context,
        {
          onStage: input.hooks?.onStage,
          onPipelineStage: input.hooks?.onPipelineStage,
        },
        {
          rollbackOnError: false,
        }
      );
    } catch (error: any) {
      const failure = error as ImportFailure;
      await this.compensationService.rollback({
        accountId: input.context.accountId,
        createdNodeIds: failure.createdNodeIds || [],
        createdEdgeIds: failure.createdEdgeIds || [],
      });
      throw error;
    }
  }
}
