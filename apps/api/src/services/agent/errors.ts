export class CandidateNotFoundError extends Error {
  constructor(candidateId: string) {
    super(`Candidate not found: ${candidateId}`);
    this.name = 'CandidateNotFoundError';
  }
}
