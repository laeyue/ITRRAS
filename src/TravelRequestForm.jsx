import { useState } from 'react'
import { supabase } from './supabaseClient'
import { format } from "date-fns"
import { Calendar as CalendarIcon, Paperclip, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.jsx"
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card"

export default function TravelRequestForm({ onCancel, onSuccess, currentRole }) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [files, setFiles] = useState([])
    const [formData, setFormData] = useState({
        title: '',
        destination: '',
        purpose: '',
        start_date: undefined,
        end_date: undefined,
        type: 'Academic',
        budget_estimate: '',
    })

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value })
    }

    const handleDateChange = (field, date) => {
        setFormData({ ...formData, [field]: date })
    }

    const handleFileChange = (e) => {
        const selectedFiles = Array.from(e.target.files)
        setFiles(prev => [...prev, ...selectedFiles])
    }

    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index))
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Not authenticated')

            // 1. Create Travel Request
            const { data: request, error: dbError } = await supabase
                .from('travel_requests')
                .insert({
                    user_id: user.id,
                    title: formData.title,
                    destination: formData.destination,
                    purpose: formData.purpose,
                    start_date: formData.start_date ? format(formData.start_date, 'yyyy-MM-dd') : null,
                    end_date: formData.end_date ? format(formData.end_date, 'yyyy-MM-dd') : null,
                    type: formData.type,
                    budget_estimate: parseFloat(formData.budget_estimate),
                    status: 'Pending Dept Review',
                    current_office: 'Department',
                    requester_role: currentRole
                })
                .select()
                .single()

            if (dbError) throw dbError

            // 2. Upload Files if any
            if (files.length > 0 && request) {
                for (const file of files) {
                    const fileExt = file.name.split('.').pop()
                    const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
                    const filePath = `${request.id}/${fileName}`

                    const { error: uploadError } = await supabase.storage
                        .from('travel_documents')
                        .upload(filePath, file)

                    if (uploadError) {
                        console.error('Error uploading file:', uploadError)
                        continue
                    }

                    // 3. Record in documents table
                    const { error: docError } = await supabase
                        .from('documents')
                        .insert({
                            request_id: request.id,
                            name: file.name,
                            file_path: filePath,
                            file_type: file.type
                        })

                    if (docError) console.error('Error saving document record:', docError)
                }
            }

            onSuccess()
        } catch (err) {
            console.error(err)
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Card className="w-full">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>New Travel Request</CardTitle>
                <Button variant="ghost" onClick={onCancel}>X</Button>
            </CardHeader>
            <CardContent>
                {error && (
                    <div className="mb-6 p-4 rounded-md bg-destructive/15 text-destructive text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <Label>Title of Activity</Label>
                        <Input
                            name="title"
                            value={formData.title}
                            onChange={handleChange}
                            required
                            placeholder="e.g. International Conference on AI"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Destination</Label>
                            <Input
                                name="destination"
                                value={formData.destination}
                                onChange={handleChange}
                                required
                                placeholder="City, Country"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Type of Travel</Label>
                            <Select name="type" value={formData.type} onValueChange={(val) => handleChange({ target: { name: 'type', value: val } })}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Academic">Academic</SelectItem>
                                    <SelectItem value="Research">Research</SelectItem>
                                    <SelectItem value="Administrative">Administrative</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2 flex flex-col">
                            <Label>Start Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-full pl-3 text-left font-normal",
                                            !formData.start_date && "text-muted-foreground"
                                        )}
                                    >
                                        {formData.start_date ? (
                                            format(formData.start_date, "PPP")
                                        ) : (
                                            <span>Pick a date</span>
                                        )}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={formData.start_date}
                                        onSelect={(date) => handleDateChange('start_date', date)}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2 flex flex-col">
                            <Label>End Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-full pl-3 text-left font-normal",
                                            !formData.end_date && "text-muted-foreground"
                                        )}
                                    >
                                        {formData.end_date ? (
                                            format(formData.end_date, "PPP")
                                        ) : (
                                            <span>Pick a date</span>
                                        )}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={formData.end_date}
                                        onSelect={(date) => handleDateChange('end_date', date)}
                                        disabled={(date) =>
                                            formData.start_date ? date < formData.start_date : false
                                        }
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Budget Estimate (PHP)</Label>
                        <Input
                            type="number"
                            name="budget_estimate"
                            value={formData.budget_estimate}
                            onChange={handleChange}
                            required
                            placeholder="0.00"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Purpose / Justification</Label>
                        <Textarea
                            name="purpose"
                            value={formData.purpose}
                            onChange={handleChange}
                            rows={4}
                            required
                            placeholder="Describe the purpose of your travel..."
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Attachments</Label>
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => document.getElementById('file-upload').click()}
                                    className="w-full md:w-auto"
                                >
                                    <Paperclip className="mr-2 h-4 w-4" />
                                    Attach Documents
                                </Button>
                                <Input
                                    id="file-upload"
                                    type="file"
                                    multiple
                                    className="hidden"
                                    accept=".pdf,.doc,.docx"
                                    onChange={handleFileChange}
                                />
                                <span className="text-sm text-muted-foreground">
                                    {files.length > 0 ? `${files.length} file(s) selected` : "No files selected"}
                                </span>
                            </div>

                            {files.length > 0 && (
                                <div className="space-y-2">
                                    {files.map((file, index) => (
                                        <div key={index} className="flex items-center justify-between p-2 rounded border bg-muted/50 text-sm">
                                            <span className="truncate max-w-[200px]">{file.name}</span>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => removeFile(index)}
                                                className="h-auto p-1 text-destructive hover:text-destructive"
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Submitting...' : 'Submit Request'}
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    )
}
