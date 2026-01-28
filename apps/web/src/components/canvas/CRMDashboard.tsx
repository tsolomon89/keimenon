'use client';

import { useEffect, useState } from 'react';
import {
  Users,
  Activity,
  Database,
  Cog,
  DollarSign,
  Zap,
  TrendingUp,
  Clock,
  AlertTriangle,
  Building2,
  FileText,
  GitBranch,
  Loader,
} from 'lucide-react';
import {
  getAnalyticsOverview,
  getTopAccounts,
  getRecentActivity,
  getSystemAlerts,
  AnalyticsOverview,
  TopAccount,
  RecentActivity as ActivityItem,
  SystemAlert,
} from '@/lib/api-client';
import { ImportsTableCard, ImportJob } from './ImportsTableCard';
import { errorCapture } from '@/services/error-capture.service';

interface CRMDashboardProps {
  onJobSelect?: (job: ImportJob) => void;
}

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: { value: string; positive: boolean };
  color?: 'blue' | 'green' | 'purple' | 'yellow' | 'red' | 'slate';
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color = 'slate',
}: MetricCardProps) {
  const colorClasses = {
    blue: 'bg-blue-600/10 border-blue-500/30 text-blue-400',
    green: 'bg-green-600/10 border-green-500/30 text-green-400',
    purple: 'bg-purple-600/10 border-purple-500/30 text-purple-400',
    yellow: 'bg-yellow-600/10 border-yellow-500/30 text-yellow-400',
    red: 'bg-red-600/10 border-red-500/30 text-red-400',
    slate: 'bg-slate-600/10 border-slate-500/30 text-slate-400',
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-2 rounded-lg border ${colorClasses[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <div
            className={`flex items-center gap-1 text-xs font-medium ${trend.positive ? 'text-green-400' : 'text-red-400'}`}
          >
            <TrendingUp className={`w-3 h-3 ${!trend.positive ? 'rotate-180' : ''}`} />
            {trend.value}
          </div>
        )}
      </div>
      <h3 className="text-sm font-medium text-slate-400 mb-1">{title}</h3>
      <p className="text-2xl font-bold text-white">{value}</p>
      {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
    </div>
  );
}

interface SectionProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}

function Section({ title, icon: Icon, children }: SectionProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-5 h-5 text-slate-400" />
        <h2 className="text-lg font-semibold text-slate-200">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export function CRMDashboard({ onJobSelect }: CRMDashboardProps) {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [topAccounts, setTopAccounts] = useState<TopAccount[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch all analytics data in parallel
        const [overviewData, topAccountsData, activityData, alertsData] = await Promise.all([
          getAnalyticsOverview(),
          getTopAccounts('usage', 10),
          getRecentActivity(20),
          getSystemAlerts(),
        ]);

        setOverview(overviewData);
        setTopAccounts(topAccountsData.accounts);
        setRecentActivity(activityData.activity);
        setAlerts(alertsData.alerts);
      } catch (err: any) {
        console.error('[CRMDashboard] Failed to fetch analytics:', err);
        console.error('[CRMDashboard] Error details:', {
          message: err.message,
          status: err.status,
          response: err.response,
          stack: err.stack?.substring(0, 200),
        });

        // Capture error for console display
        const capturedError = errorCapture.capture(
          err,
          {
            domain: 'analytics',
            operation: 'dashboard.fetchAnalytics',
            metadata: {
              component: 'CRMDashboard',
              fetchType: 'parallel',
            },
          },
          'error'
        );

        // Set user-friendly error message
        const userMessage =
          capturedError.userMessage || err.message || 'Failed to load analytics data';
        console.error('[CRMDashboard] Setting error message:', userMessage);
        setError(userMessage);
      } finally {
        console.log('[CRMDashboard] Fetch complete, setting loading = false');
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  // Format helpers
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    return `${Math.round(minutes / 60)}h`;
  };

  // Handler for import job selection
  const handleImportJobSelect = (jobId: string, job: ImportJob) => {
    console.log('Import job selected:', jobId, job);
    // TODO: Open Import Inspector in right sidebar
    // Related: apps/web/src/components/keimenon/KeimenonSidebar.tsx (add import-detail panel)
    // Related: apps/web/src/components/inspector/ImportInspector.tsx (needs creation)
  };

  const handleImportJobsMultiSelect = (jobIds: string[], jobs: ImportJob[]) => {
    console.log('Multiple import jobs selected:', jobIds.length);
    // TODO: Show bulk actions in Inspector Bar
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold mb-2">Manager Dashboard</h1>
          <p className="text-sm text-slate-400">System-wide analytics and metrics</p>
        </div>

        {/* Imports Table - Always visible, even when analytics loading */}
        <ImportsTableCard
          onJobSelect={handleImportJobSelect}
          onJobsMultiSelect={handleImportJobsMultiSelect}
        />

        {/* Analytics sections - show loading/error states only for these */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader className="w-8 h-8 animate-spin text-purple-500 mx-auto mb-4" />
              <p className="text-sm text-slate-400">Loading analytics...</p>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-4" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && overview && (
          <>
            {/* Account Metrics */}
            <Section title="Account Metrics" icon={Building2}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                  title="Active Accounts"
                  value={overview.accounts.active}
                  icon={Building2}
                  color="blue"
                />
                <MetricCard
                  title="Total Seats"
                  value={overview.accounts.total_seats}
                  icon={Users}
                  color="purple"
                />
                <MetricCard
                  title="Free Tier"
                  value={overview.accounts.tier_distribution.free}
                  icon={Building2}
                  color="slate"
                />
                <MetricCard
                  title="Business Tier"
                  value={overview.accounts.tier_distribution.business}
                  icon={Building2}
                  color="blue"
                />
              </div>
            </Section>

            {/* User Activity */}
            <Section title="User Activity" icon={Activity}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricCard
                  title="Last 7 Days"
                  value={overview.user_activity.last_7_days}
                  subtitle="Active users"
                  icon={Users}
                  color="green"
                />
                <MetricCard
                  title="Last 30 Days"
                  value={overview.user_activity.last_30_days}
                  subtitle="Active users"
                  icon={Users}
                  color="green"
                />
                <MetricCard
                  title="Avg Session Time"
                  value={formatTime(overview.user_activity.avg_session_time_minutes)}
                  icon={Clock}
                  color="purple"
                />
              </div>
            </Section>

            {/* Storage & Resources */}
            <Section title="Storage & Resources" icon={Database}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                  title="Total Nodes"
                  value={overview.storage.total_nodes.toLocaleString()}
                  icon={GitBranch}
                  color="blue"
                />
                <MetricCard
                  title="Total Edges"
                  value={overview.storage.total_edges.toLocaleString()}
                  icon={GitBranch}
                  color="purple"
                />
                <MetricCard
                  title="Total Sources"
                  value={overview.storage.total_sources.toLocaleString()}
                  icon={FileText}
                  color="green"
                />
                <MetricCard
                  title="Storage Used"
                  value={formatBytes(overview.storage.storage_size_bytes)}
                  icon={Database}
                  color="yellow"
                />
              </div>
            </Section>

            {/* Processing Jobs */}
            <Section title="Processing Jobs" icon={Cog}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricCard
                  title="Active Jobs"
                  value={overview.processing.active}
                  icon={Cog}
                  color="blue"
                />
                <MetricCard
                  title="Completed Today"
                  value={overview.processing.completed_today}
                  icon={Cog}
                  color="green"
                />
                <MetricCard
                  title="Failed Jobs"
                  value={overview.processing.failed}
                  icon={AlertTriangle}
                  color="red"
                />
              </div>
            </Section>

            {/* Billing & Revenue */}
            <Section title="Billing & Revenue" icon={DollarSign}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricCard
                  title="Monthly Recurring Revenue"
                  value={`$${overview.billing.mrr.toLocaleString()}`}
                  icon={DollarSign}
                  color="green"
                />
                <MetricCard
                  title="Churn Rate"
                  value={`${overview.billing.churn_rate.toFixed(1)}%`}
                  icon={TrendingUp}
                  color="yellow"
                />
                <MetricCard
                  title="Customer LTV"
                  value={`$${overview.billing.customer_ltv.toLocaleString()}`}
                  icon={DollarSign}
                  color="purple"
                />
              </div>
            </Section>

            {/* System Health */}
            <Section title="System Health" icon={Zap}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricCard
                  title="API Latency"
                  value={`${overview.system_health.api_latency_ms}ms`}
                  subtitle="Avg response time"
                  icon={Zap}
                  color="blue"
                />
                <MetricCard
                  title="Error Rate"
                  value={`${overview.system_health.error_rate.toFixed(2)}%`}
                  subtitle="Last 24 hours"
                  icon={AlertTriangle}
                  color="green"
                />
                <MetricCard
                  title="Uptime"
                  value={`${overview.system_health.uptime_percent.toFixed(1)}%`}
                  subtitle="Last 30 days"
                  icon={Zap}
                  color="green"
                />
              </div>
            </Section>

            {/* Top Accounts & Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Accounts */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <h3 className="text-sm font-semibold text-slate-300 mb-4">Top Accounts by Usage</h3>
                {topAccounts.length > 0 ? (
                  <div className="space-y-3">
                    {topAccounts.map((account) => (
                      <div
                        key={account.id}
                        className="flex items-center justify-between py-2 px-3 bg-slate-900/50 rounded-lg hover:bg-slate-900 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Building2 className="w-4 h-4 text-slate-400" />
                          <div>
                            <p className="text-sm font-medium text-slate-200">{account.name}</p>
                            <p className="text-xs text-slate-500 capitalize">
                              {account.account_class}
                            </p>
                          </div>
                        </div>
                        <span className="text-sm text-slate-400">
                          {account.activity_count || account.node_count || 0}{' '}
                          {account.activity_count ? 'actions' : 'nodes'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500 text-center py-8">No data available</div>
                )}
              </div>

              {/* Recent Activity */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <h3 className="text-sm font-semibold text-slate-300 mb-4">Recent Activity</h3>
                {recentActivity.length > 0 ? (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {recentActivity.map((activity) => (
                      <div
                        key={activity.id}
                        className="py-2 px-3 bg-slate-900/50 rounded-lg hover:bg-slate-900 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="text-sm text-slate-200">{activity.action}</p>
                            <p className="text-xs text-slate-500 mt-1">
                              {activity.user_name} • {activity.account_name}
                            </p>
                          </div>
                          <span className="text-xs text-slate-500 whitespace-nowrap">
                            {new Date(activity.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500 text-center py-8">No recent activity</div>
                )}
              </div>
            </div>

            {/* System Alerts */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                <h3 className="text-sm font-semibold text-slate-300">System Alerts</h3>
              </div>
              {alerts.length > 0 ? (
                <div className="space-y-3">
                  {alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-4 rounded-lg border ${
                        alert.type === 'error'
                          ? 'bg-red-600/10 border-red-500/30'
                          : alert.type === 'warning'
                            ? 'bg-yellow-600/10 border-yellow-500/30'
                            : 'bg-blue-600/10 border-blue-500/30'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <AlertTriangle
                          className={`w-5 h-5 flex-shrink-0 ${
                            alert.type === 'error'
                              ? 'text-red-400'
                              : alert.type === 'warning'
                                ? 'text-yellow-400'
                                : 'text-blue-400'
                          }`}
                        />
                        <div className="flex-1">
                          <p className="text-sm text-slate-200">{alert.message}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {new Date(alert.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-500 text-center py-4">No active alerts</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
