import React, { useEffect, useState } from 'react';
import {
  X,
  ShieldAlert,
  CheckCircle2,
  RefreshCw,
  Download,
  ExternalLink,
  FolderOpen,
  Check,
  AlertCircle,
} from 'lucide-react';
import type { LocalInferenceStatus, LocalModelManifest } from '@keimenon/types';
import { organizationService } from '../../services/organization-service';

interface GemmaSetupPanelProps {
  status: LocalInferenceStatus | null;
  onClose: () => void;
  onRefresh: () => void;
  isChecking?: boolean;
}

export function GemmaSetupPanel({ status, onClose, onRefresh, isChecking }: GemmaSetupPanelProps) {
  const [sources, setSources] = useState<any[]>([]);
  const [activeModel, setActiveModel] = useState<LocalModelManifest | null>(null);
  const [directoryInfo, setDirectoryInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [helperStatus, setHelperStatus] = useState<any>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [fetchedSources, fetchedActiveModel, fetchedDirInfo, fetchedHelperStatus] =
        await Promise.all([
          organizationService.getLocalInferenceSources(),
          organizationService.getActiveLocalInferenceModel(),
          organizationService.getLocalInferenceDirectory(),
          organizationService.getHelperStatus().catch(() => null),
        ]);
      setSources(fetchedSources);
      setActiveModel(fetchedActiveModel);
      setDirectoryInfo(fetchedDirInfo);
      setHelperStatus(fetchedHelperStatus);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError('Failed to load Gemma 4 candidates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (!status) return null;

  const handleSelectCandidate = async (candidateId: string) => {
    try {
      await organizationService.createPendingLocalInferenceModel(candidateId);
      await fetchData();
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to select candidate');
    }
  };

  const handleAcceptTerms = async (candidateId: string) => {
    try {
      await organizationService.acceptGemmaTerms({
        model_family: 'gemma',
        candidate_id: candidateId,
        accepted: true,
        terms_source: 'ui_panel',
      });
      await fetchData();
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to accept terms');
    }
  };

  const handleVerifyFile = async (candidateId: string) => {
    try {
      await organizationService.verifyLocalModel(candidateId);
      await fetchData();
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to verify file');
    }
  };

  const handleValidateModel = async (candidateId: string) => {
    try {
      const res = await organizationService.validateHelperModel(candidateId);
      if (res && res.error) {
        setError(`Validation error: ${res.error.message}`);
      }
      await fetchData();
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to validate model');
    }
  };

  const handleLoadModel = async (candidateId: string) => {
    try {
      const res = await organizationService.loadHelperModel(candidateId);
      if (res && res.error) {
        setError(`Load error: ${res.error.message}`);
      }
      await fetchData();
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to load model');
    }
  };

  const openModelFolder = async () => {
    if ((window as any).electronAPI?.openModelFolder) {
      await (window as any).electronAPI.openModelFolder();
    } else {
      alert('Folder opens are only supported in the desktop app.');
    }
  };

  const isReady = status.state === 'ready';

  return (
    <div className="absolute top-12 right-0 w-[500px] bg-slate-900 border border-slate-800 rounded-lg shadow-xl overflow-hidden z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-2">
          {isReady ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-amber-500" />
          )}
          <h3 className="text-sm font-medium text-slate-100">Local Inference Setup</h3>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 transition-colors"
          aria-label="Close setup panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto max-h-[75vh]">
        <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/50 mb-4">
          <h4 className="text-sm font-semibold text-slate-200 mb-1">Gemma 4 Acquisition Flow</h4>
          <p className="text-xs text-slate-400">
            Keimenon targets <strong>Gemma 4</strong> for local inference.
          </p>
        </div>

        {error && (
          <div className="bg-red-900/20 text-red-400 p-3 rounded border border-red-900/50 text-xs mb-4">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-4 text-xs text-slate-500">Loading candidates...</div>
          ) : sources.length === 0 ? (
            <div className="text-center py-4 text-xs text-slate-500">No candidates available</div>
          ) : (
            sources.map((candidate) => {
              const isActive = activeModel?.candidate_id === candidate.id;

              return (
                <div
                  key={candidate.id}
                  className={`p-4 rounded-lg border ${isActive ? 'bg-slate-800/80 border-blue-500/50' : 'bg-slate-800/40 border-slate-700/50'}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="text-sm font-medium text-slate-200">
                        {candidate.display_name}
                      </h4>
                      <div className="text-xs text-slate-500 mt-0.5">ID: {candidate.id}</div>
                    </div>
                    {isActive && (
                      <span className="bg-blue-500/20 text-blue-400 text-[10px] uppercase px-2 py-0.5 rounded font-semibold tracking-wider">
                        Active Selection
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 mt-3 mb-4">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">Source:</span>
                      {candidate.source_verified ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <Check className="w-3 h-3" /> verified
                        </span>
                      ) : (
                        <span className="text-slate-500">unverified</span>
                      )}
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">Artifact:</span>
                      {candidate.artifact_verified ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <Check className="w-3 h-3" /> verified
                        </span>
                      ) : (
                        <span className="text-amber-500 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> pending exact native/LiteRT
                          verification
                        </span>
                      )}
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">Runtime compatibility:</span>
                      {candidate.runtime_compatibility_verified ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <Check className="w-3 h-3" /> verified
                        </span>
                      ) : (
                        <span className="text-slate-500 flex items-center gap-1">pending</span>
                      )}
                    </div>

                    {isActive && activeModel?.verification_status && (
                      <div className="flex justify-between items-center text-xs mt-2 pt-2 border-t border-slate-700/50">
                        <span className="text-slate-400">Local Status:</span>
                        <span
                          className={
                            activeModel.verification_status === 'presence_verified'
                              ? 'text-blue-400'
                              : activeModel.verification_status === 'verified'
                                ? 'text-emerald-400'
                                : 'text-slate-500'
                          }
                        >
                          {activeModel.verification_status}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 mt-4">
                    {!isActive && (
                      <button
                        onClick={() => handleSelectCandidate(candidate.id)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded transition-colors"
                      >
                        Select Candidate
                      </button>
                    )}

                    {isActive && activeModel?.license_required && !activeModel.license_accepted && (
                      <button
                        onClick={() => handleAcceptTerms(candidate.id)}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs rounded transition-colors"
                      >
                        Accept Terms
                      </button>
                    )}

                    <a
                      href={candidate.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded transition-colors flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3 h-3" /> View Official Source
                    </a>

                    {isActive && (
                      <button
                        onClick={openModelFolder}
                        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded transition-colors flex items-center gap-1.5"
                      >
                        <FolderOpen className="w-3 h-3" /> Open Model Folder
                      </button>
                    )}

                    {isActive && (
                      <button
                        onClick={() => handleVerifyFile(candidate.id)}
                        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded transition-colors"
                      >
                        Verify Local File
                      </button>
                    )}

                    {isActive && activeModel?.verification_status === 'presence_verified' && (
                      <>
                        <button
                          onClick={() => handleValidateModel(candidate.id)}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs rounded transition-colors"
                        >
                          Validate Model
                        </button>
                        <button
                          onClick={() => handleLoadModel(candidate.id)}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded transition-colors"
                        >
                          Load Model
                        </button>
                      </>
                    )}

                    {isActive && helperStatus && (
                      <div className="w-full mt-2 p-2 rounded bg-slate-900 border border-slate-700 text-xs">
                        <span className="text-slate-400">Helper Status: </span>
                        <span
                          className={
                            helperStatus.state === 'ready' || helperStatus.state === 'model_loaded'
                              ? 'text-emerald-400'
                              : helperStatus.state === 'runtime_dependency_missing'
                                ? 'text-amber-500'
                                : helperStatus.state === 'error' ||
                                    helperStatus.state === 'model_load_failed'
                                  ? 'text-red-400'
                                  : 'text-slate-300'
                          }
                        >
                          {helperStatus.state}
                        </span>
                        {helperStatus.message && (
                          <div className="mt-1 text-slate-500">{helperStatus.message}</div>
                        )}
                      </div>
                    )}

                    <button
                      disabled={!candidate.artifact_verified}
                      className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5 w-full justify-center mt-2 ${
                        candidate.artifact_verified
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                      }`}
                      title={
                        !candidate.artifact_verified
                          ? 'Download blocked pending artifact verification'
                          : ''
                      }
                    >
                      <Download className="w-3 h-3" /> Download Model
                    </button>
                    {!candidate.artifact_verified && (
                      <div className="w-full text-center text-[10px] text-amber-500/70 mt-1">
                        disabled_reason: exact LiteRT artifact verification pending
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="p-4 border-t border-slate-800 bg-slate-900/80">
        <button
          onClick={() => {
            fetchData();
            onRefresh();
          }}
          disabled={isChecking || loading}
          className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-slate-200 rounded transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isChecking || loading ? 'animate-spin' : ''}`} />
          {isChecking || loading ? 'Checking...' : 'Re-check Status'}
        </button>
      </div>
    </div>
  );
}
