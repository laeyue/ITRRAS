import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Auth from './Auth'
import TravelRequestForm from './TravelRequestForm'
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Paperclip, Eye, LayoutDashboard, FileText, Settings, User, LogOut, CheckCircle, AlertCircle, Clock, Palette } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const OFFICE_ROLE_MAP = {
  'Department': 'Dept. Head',
  'Dean': 'Dean',
  'KTTO': 'KTTO Staff',
  'OVCRE': 'OVCRE Staff',
  'OVCAA': 'OVCAA/OVCPD',
  'Finance': 'Finance',
  'Chancellor': 'Chancellor'
}

const ROLES = ['Faculty', 'Dept. Head', 'Dean', 'KTTO Staff', 'OVCRE Staff', 'OVCAA/OVCPD', 'Finance', 'Chancellor']

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [view, setView] = useState('dashboard') // 'dashboard', 'new-request'
  const [requests, setRequests] = useState([])
  const [loadingAction, setLoadingAction] = useState(null)
  const [selectedRequest, setSelectedRequest] = useState(null)

  const [requestDocuments, setRequestDocuments] = useState([])
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark')
  const [simulatedRole, setSimulatedRole] = useState(null)

  const effectiveRole = (profile?.role === 'Super Admin' && simulatedRole) ? simulatedRole : profile?.role

  // Apply theme to HTML element
  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('light', 'dark', 'msu-iit')

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      root.classList.add(systemTheme)
    } else {
      root.classList.add(theme)
    }

    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    if (selectedRequest) {
      fetchDocuments(selectedRequest.id)
    } else {
      setRequestDocuments([])
    }
  }, [selectedRequest])

  const fetchDocuments = async (requestId) => {
    const { data } = await supabase.from('documents').select('*').eq('request_id', requestId)
    if (data) setRequestDocuments(data)
  }

  const getFileUrl = (path) => {
    const { data } = supabase.storage.from('travel_documents').getPublicUrl(path)
    return data.publicUrl
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        fetchProfile(session.user.id)
        fetchRequests()
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        fetchProfile(session.user.id)
        fetchRequests()
      } else {
        setProfile(null)
        setRequests([])
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'travel_requests' }, (payload) => {
        fetchRequests()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session])

  const fetchProfile = async (userId) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (data) setProfile(data)
  }

  const fetchRequests = async () => {
    const { data } = await supabase.from('travel_requests').select('*, profiles(full_name, department)').order('created_at', { ascending: false })
    if (data) setRequests(data)
  }

  const [myFiles, setMyFiles] = useState([])

  const fetchMyFiles = async () => {
    const { data } = await supabase
      .from('documents')
      .select('*, travel_requests!inner(user_id, title)')
      .eq('travel_requests.user_id', session.user.id)
      .order('uploaded_at', { ascending: false })

    if (data) setMyFiles(data)
  }

  useEffect(() => {
    if (view === 'my-files' && session) {
      fetchMyFiles()
    } else if (view === 'tracking' && session) {
      fetchAuditLogs()
    }
  }, [view, session])

  const [auditLogs, setAuditLogs] = useState([])

  const fetchAuditLogs = async () => {
    const { data } = await supabase
      .from('approvals')
      .select('*, profiles:approver_id(full_name, role), travel_requests:request_id(title)')
      .order('created_at', { ascending: false })
      .limit(50)

    if (data) setAuditLogs(data)
  }

  const submitVerdict = async (requestId, currentOffice, verdict) => {
    if (!profile) return
    setLoadingAction(requestId)
    try {
      const { error } = await supabase.from('approvals').insert({
        request_id: requestId,
        approver_id: session.user.id,
        office: currentOffice,
        status: verdict,
        comments: `${verdict} by ${effectiveRole}${profile.role === 'Super Admin' ? ' (Admin Override)' : ''}`
      })
      if (error) throw error
      await new Promise(r => setTimeout(r, 500))
      await fetchRequests()
    } catch (error) {
      alert('Error processing request: ' + error.message)
    } finally {
      setLoadingAction(null)
    }
  }

  if (!session) return <Auth />

  // Derived state

  // My Requests: Only show requests where the user is the creator.
  // We removed simulation, so simply check user_id.
  const myRequests = requests.filter(r => r.user_id === session.user.id)

  const pendingApprovals = requests.filter(r => {
    if (['Approved', 'Rejected', 'Returned'].includes(r.status)) return false
    return OFFICE_ROLE_MAP[r.current_office] === effectiveRole
  })

  // Pending for stats
  const pendingCount = myRequests.filter(r => r.status.includes('Pending')).length
  const approvedCount = myRequests.filter(r => r.status === 'Approved').length
  const returnedCount = myRequests.filter(r => r.status === 'Returned').length

  const getStatusBadgeVariant = (status) => {
    if (status === 'Approved') return 'success'
    if (status === 'Returned' || status === 'Rejected') return 'destructive'
    return 'secondary'
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card hidden md:flex flex-col">
        <div className="p-6">
          <h1 className="text-2xl font-bold tracking-tight">ITRRAS</h1>
          <p className="text-sm text-muted-foreground mt-1">Portal</p>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          <Button variant="ghost" className="w-full justify-start" onClick={() => setView('dashboard')}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Dashboard
          </Button>
          <Button variant="ghost" className="w-full justify-start" onClick={() => setView('new-request')}>
            <FileText className="mr-2 h-4 w-4" />
            New Request
          </Button>
          <div className="pt-4 pb-2">
            <p className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Documents
            </p>
          </div>
          <Button variant="ghost" className="w-full justify-start" onClick={() => setView('my-files')}>
            My Files
          </Button>
        </nav>
        <div className="p-4 border-t">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
              {profile?.full_name?.[0] || 'U'}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate">{profile?.full_name}</p>
              <p className="text-xs text-muted-foreground truncate">{profile?.role}</p>
            </div>
          </div>
          <Button variant="outline" className="w-full justify-start text-muted-foreground" onClick={() => supabase.auth.signOut()}>
            <LogOut className="mr-2 h-4 w-4" />
            Log Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-16 border-b flex items-center justify-between px-8 bg-card/50 backdrop-blur top-0 sticky z-10">
          <h2 className="text-lg font-semibold capitalize">{view.replace('-', ' ')}</h2>
          <div className="flex items-center gap-4">
            {profile && ['Dept. Head', 'Dean', 'KTTO Staff', 'OVCRE Staff', 'OVCAA/OVCPD', 'Finance', 'Chancellor', 'Super Admin'].includes(profile.role) && (
              <Button variant="ghost" size="icon" onClick={() => setView('tracking')} title="Audit Tracking">
                <Clock className="h-5 w-5" />
              </Button>
            )}
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger className="w-[140px]">
                <div className="flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  <SelectValue placeholder="Theme" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="msu-iit">MSU-IIT</SelectItem>
              </SelectContent>
            </Select>

            {profile && profile.role === 'Super Admin' && (
              <Select value={simulatedRole || ''} onValueChange={setSimulatedRole}>
                <SelectTrigger className="w-[180px] border-dashed border-yellow-500 text-yellow-500">
                  <User className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Simulate Role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.filter(r => r !== 'Super Admin').map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button onClick={() => setView('new-request')}>+ Quick Create</Button>
          </div>
        </header>

        <div className="p-8 space-y-8 max-w-7xl mx-auto w-full">
          {view === 'new-request' ? (
            <TravelRequestForm
              onCancel={() => setView('dashboard')}
              onSuccess={() => { setView('dashboard'); fetchRequests(); }}
              currentRole={profile?.role} // Pass actual role, no sim
            />
          ) : view === 'my-files' ? (
            <Card>
              <CardHeader>
                <CardTitle>My Files</CardTitle>
                <CardDescription>All documents you have uploaded across your travel requests.</CardDescription>
              </CardHeader>
              <CardContent>
                {myFiles.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">You haven't uploaded any files yet.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File Name</TableHead>
                        <TableHead>Related Request</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Uploaded</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myFiles.map((file) => (
                        <TableRow key={file.id}>
                          <TableCell className="font-medium flex items-center gap-2">
                            <FileText className="h-4 w-4 text-primary" />
                            {file.name}
                          </TableCell>
                          <TableCell>{file.travel_requests?.title}</TableCell>
                          <TableCell>{file.file_type || 'Document'}</TableCell>
                          <TableCell>{new Date(file.uploaded_at).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right">
                            <a
                              href={getFileUrl(file.file_path)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Button variant="outline" size="sm">
                                <Eye className="mr-2 h-4 w-4" />
                                View
                              </Button>
                            </a>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ) : view === 'tracking' ? (
            <Card>
              <CardHeader>
                <CardTitle>Audit Tracking</CardTitle>
                <CardDescription>Recent approval actions across the system.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Approver</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Request</TableHead>
                      <TableHead className="text-right">Comments</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground h-24">No recent activity recorded.</TableCell>
                      </TableRow>
                    ) : (
                      auditLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-muted-foreground text-xs">
                            <div className="flex flex-col">
                              <span>{new Date(log.created_at).toLocaleDateString()}</span>
                              <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{log.profiles?.full_name || 'Unknown'}</TableCell>
                          <TableCell>{log.office}</TableCell>
                          <TableCell>
                            <Badge variant={getStatusBadgeVariant(log.status)}>{log.status}</Badge>
                          </TableCell>
                          <TableCell>{log.travel_requests?.title || 'Deleted Request'}</TableCell>
                          <TableCell className="text-right text-muted-foreground max-w-[200px] truncate" title={log.comments}>
                            {log.comments}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Role specific 'Action Required' */}
              {pendingApprovals.length > 0 && (
                <Card className="border-secondary/50 bg-secondary/5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive">
                      <AlertCircle className="h-5 w-5" />
                      Action Required
                    </CardTitle>
                    <CardDescription>You have requests pending your approval.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Request Title</TableHead>
                          <TableHead>Requester</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Budget</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingApprovals.map(req => (
                          <TableRow key={req.id}>
                            <TableCell className="font-medium">{req.title}</TableCell>
                            <TableCell>{req.profiles?.full_name}</TableCell>
                            <TableCell>{req.type}</TableCell>
                            <TableCell>₱{req.budget_estimate}</TableCell>
                            <TableCell className="text-right space-x-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedRequest(req)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => submitVerdict(req.id, req.current_office, 'Returned')}
                                disabled={loadingAction === req.id}
                              >
                                Return
                              </Button>
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700"
                                onClick={() => submitVerdict(req.id, req.current_office, 'Approved')}
                                disabled={loadingAction === req.id}
                              >
                                Approve
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Stats Row */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{myRequests.length}</div>
                    <p className="text-xs text-muted-foreground">Lifetime submissions</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Pending</CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{pendingCount}</div>
                    <p className="text-xs text-muted-foreground">In progress</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Approved</CardTitle>
                    <CheckCircle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{approvedCount}</div>
                    <p className="text-xs text-muted-foreground">Authorized travel</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Returned</CardTitle>
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{returnedCount}</div>
                    <p className="text-xs text-muted-foreground">Requires attention</p>
                  </CardContent>
                </Card>
              </div>

              {/* My Requests Table */}
              <Card>
                <CardHeader>
                  <CardTitle>My Requests</CardTitle>
                  <CardDescription>A list of your recent travel requests.</CardDescription>
                </CardHeader>
                <CardContent>
                  {myRequests.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">No requests found. Create one to get started.</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Destination</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Current Office</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {myRequests.map((req) => (
                          <TableRow key={req.id}>
                            <TableCell className="font-medium">{req.title}</TableCell>
                            <TableCell>{req.destination}</TableCell>
                            <TableCell>{req.start_date} to {req.end_date}</TableCell>
                            <TableCell>
                              <Badge variant={getStatusBadgeVariant(req.status)}>{req.status}</Badge>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">{req.current_office}</TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" onClick={() => setSelectedRequest(req)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>

      <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex justify-between items-center pr-8">
              <span>{selectedRequest?.title}</span>
              {selectedRequest && <Badge variant={getStatusBadgeVariant(selectedRequest.status)}>{selectedRequest.status}</Badge>}
            </DialogTitle>
            <DialogDescription>
              Request ID: {selectedRequest?.id}
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Requester</h4>
                  <p>{selectedRequest.profiles?.full_name} ({selectedRequest.profiles?.department})</p>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Destination</h4>
                  <p>{selectedRequest.destination}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Dates</h4>
                  <p>{selectedRequest.start_date} to {selectedRequest.end_date}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Type</h4>
                  <p>{selectedRequest.type}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Budget Estimate</h4>
                  <p>₱{selectedRequest.budget_estimate}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Current Office</h4>
                  <p>{selectedRequest.current_office}</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-sm text-muted-foreground mb-1">Purpose</h4>
                <div className="p-3 bg-muted/30 rounded-md text-sm whitespace-pre-wrap">
                  {selectedRequest.purpose}
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-sm text-muted-foreground mb-2 flex items-center gap-2">
                  <Paperclip className="h-4 w-4" />
                  Attachments
                </h4>
                {requestDocuments.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No documents attached.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {requestDocuments.map(doc => (
                      <a
                        key={doc.id}
                        href={getFileUrl(doc.file_path)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 border rounded-md hover:bg-muted/50 transition-colors group"
                      >
                        <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center text-primary">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className="text-sm font-medium truncate group-hover:underline">{doc.name}</p>
                          <p className="text-xs text-muted-foreground">{new Date(doc.uploaded_at).toLocaleDateString()}</p>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
