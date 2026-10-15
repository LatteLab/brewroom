import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { getDashboardStats, getRecentUsers } from '@/lib/db/queries';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/admin/stat-card';
import { getEventStats } from '@/lib/db/event-queries';
import { Users, Shield, TrendingUp, UserPlus, Calendar, BarChart3, UserX } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default async function AdminDashboard() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  if (!session.user.isAdmin) {
    redirect('/user');
  }

  const stats = await getDashboardStats();
  const recentUsers = await getRecentUsers(5);
  const eventStats = await getEventStats();

  // Calculate trends
  const monthlyGrowth = stats.usersLastMonth > 0
    ? `${((stats.usersThisMonth - stats.usersLastMonth) / stats.usersLastMonth * 100).toFixed(1)}% from last month`
    : 'First month';

  return (
    <>
      <PageHeader title="Dashboard" showSidebarTrigger />

      <div className="flex flex-1 flex-col gap-4 p-6">
        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Users"
            value={stats.totalUsers}
            icon={Users}
            description="All registered users"
          />
          <StatCard
            title="Total Admins"
            value={stats.totalAdmins}
            icon={Shield}
            description={`${((stats.totalAdmins / Math.max(stats.totalUsers, 1)) * 100).toFixed(1)}% of users`}
          />
          <StatCard
            title="This Month"
            value={stats.usersThisMonth}
            icon={TrendingUp}
            trend={monthlyGrowth}
          />
          <StatCard
            title="This Week"
            value={stats.usersThisWeek}
            icon={UserPlus}
            description="New users this week"
          />
        </div>

        {/* Event Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            title="Total Events"
            value={eventStats.totalEvents}
            icon={Calendar}
            description="Completed events"
          />
          <StatCard
            title="Attendance Rate"
            value={`${eventStats.avgAttendanceRate}%`}
            icon={BarChart3}
            description="Average across events"
          />
          <StatCard
            title="No-Show Rate"
            value={`${eventStats.noShowRate}%`}
            icon={UserX}
            description="Average across events"
          />
        </div>

        {/* Recent Users & Quick Actions */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent Users</CardTitle>
              <CardDescription>Latest users who joined</CardDescription>
            </CardHeader>
            <CardContent>
              {recentUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No users yet</p>
              ) : (
                <div className="space-y-3">
                  {recentUsers.map((user) => (
                    <div key={user.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{user.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          }) : 'N/A'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4">
                <Link href="/admin/users">
                  <Button variant="outline" className="w-full">View All Users</Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common administrative tasks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/admin/events">
                <Button variant="outline" className="w-full justify-start">
                  <Calendar className="mr-2 h-4 w-4" />
                  Manage Events
                </Button>
              </Link>
              <Link href="/admin/users">
                <Button variant="outline" className="w-full justify-start">
                  <Users className="mr-2 h-4 w-4" />
                  Manage Users
                </Button>
              </Link>
              <Link href="/admin/settings">
                <Button variant="outline" className="w-full justify-start">
                  <Shield className="mr-2 h-4 w-4" />
                  Admin Whitelist
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
