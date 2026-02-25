import { api } from '@/lib/api-client';
import { AiAnalysisResult } from '@keimenon/types';

export const aiService = {
  /**
   * Analyze a specific source document
   */
  analyzeSource: async (sourceId: string, content: string): Promise<AiAnalysisResult> => {
    const response = await api.post<AiAnalysisResult>('/ai/analyze-source', {
      sourceId,
      content,
    });
    return response.data;
  },
};
