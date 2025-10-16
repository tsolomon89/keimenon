import { useState, useEffect } from 'react';
import { Building2, Wrench, Crown, Zap } from 'lucide-react';
import { TreeNode } from '@/components/common/NavigationBar';
import { getAccounts, Account } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';

export function useAccountTree() {
  const { user } = useAuth();
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only fetch if user is admin
    if (user?.accountType !== 'admin') {
      setTreeData([]);
      setLoading(false);
      return;
    }

    const fetchAccountTree = async () => {
      try {
        setLoading(true);
        setError(null);

        const { accounts } = await getAccounts();

        // Separate accounts into client and debug
        const clientAccounts = accounts.filter(
          (acc) => acc.account_type === 'client' && !acc.mode_service
        );
        const debugAccounts = accounts.filter(
          (acc) => acc.mode_service === true
        );

        // Build tree structure
        const tree: TreeNode[] = [
          {
            id: 'client-accounts',
            label: 'Client Accounts',
            icon: Building2,
            badge: clientAccounts.length,
            badgeColor: 'blue',
            children: clientAccounts.map((account) => accountToTreeNode(account)),
          },
          {
            id: 'debug-accounts',
            label: 'Debug Accounts',
            icon: Wrench,
            badge: debugAccounts.length,
            badgeColor: 'yellow',
            children: debugAccounts.map((account) => accountToTreeNode(account)),
          },
        ];

        setTreeData(tree);
      } catch (err: any) {
        console.error('Failed to fetch account tree:', err);
        setError(err.message || 'Failed to load accounts');
      } finally {
        setLoading(false);
      }
    };

    fetchAccountTree();
  }, [user?.accountType]);

  return { treeData, loading, error };
}

/**
 * Convert Account to TreeNode format
 */
function accountToTreeNode(account: Account): TreeNode {
  // Determine icon based on account class
  let icon = Building2;
  if (account.account_class === 'business') {
    icon = Crown;
  } else if (account.account_class === 'professional') {
    icon = Zap;
  }

  // Determine badge color based on tier
  let badgeColor: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'slate' = 'slate';
  if (account.account_class === 'business') {
    badgeColor = 'blue';
  } else if (account.account_class === 'professional') {
    badgeColor = 'purple';
  } else {
    badgeColor = 'slate';
  }

  return {
    id: account.id,
    label: account.name || account.id,
    icon,
    badge: getTierLabel(account.account_class),
    badgeColor,
    metadata: {
      accountId: account.id,
      accountType: account.account_type,
      accountClass: account.account_class,
      serviceMode: account.mode_service,
      parentAccountId: account.parent_account_id,
      rank: account.rank,
    },
  };
}

/**
 * Get display label for tier
 */
function getTierLabel(accountClass: string): string {
  switch (accountClass) {
    case 'business':
      return 'Business';
    case 'professional':
      return 'Pro';
    case 'free':
      return 'Free';
    default:
      return accountClass;
  }
}
