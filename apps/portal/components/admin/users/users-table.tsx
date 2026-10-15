'use client';

import type { User } from '@/lib/db/schema';

export function AdminUsersTable({ initialUsers }: { initialUsers: User[] }) {
  return (
    <div className="space-y-4">
      {initialUsers.length === 0 ? (
        <p className="text-muted-foreground">No users found</p>
      ) : (
        <div className="space-y-2">
          {initialUsers.map((user) => (
            <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">{user.email}</p>
                <p className="text-sm text-muted-foreground">
                  ID: {user.id}
                </p>
                <p className="text-xs text-muted-foreground">
                  Joined: {user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  }) : 'N/A'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-sm text-muted-foreground mt-4">
        💡 To manage admin permissions, use the Admin Whitelist above. Users with emails in the whitelist will automatically have admin access.
      </p>
    </div>
  );
}
