"use client"

import { useState, useMemo } from "react"
import { Search } from "lucide-react"
import { HarFile, HarEntry } from "@/types/har"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"

interface HarViewerProps {
  fileContent: string // The raw JSON string from your upload component
}

export function FileViewer({ fileContent }: HarViewerProps) {
  const [selectedRequest, setSelectedRequest] = useState<HarEntry | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const entries = useMemo(() => {
    try {
      const parsed: HarFile = JSON.parse(fileContent)
      return parsed.log.entries
    } catch (e) {
      console.error("Invalid HAR file", e)
      return []
    }
  }, [fileContent])

  // Filter entries based on search query
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) {
      return entries
    }

    const query = searchQuery.toLowerCase()
    return entries.filter((entry) => {
      const url = entry.request.url.toLowerCase()
      const method = entry.request.method.toLowerCase()
      const status = entry.response.status.toString()
      
      return url.includes(query) || method.includes(query) || status.includes(query)
    })
  }, [entries, searchQuery])

  return (
    <div className="border rounded-md h-full overflow-hidden w-full flex flex-col">
      <div className="border-b bg-background shrink-0 p-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by URL, method, or status..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-border/50 rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring/30 focus:border-border"
          />
        </div>
      </div>
      <div className="border-b bg-background shrink-0">
        <Table className="w-full table-fixed">
          <TableHeader>
            <TableRow className="border-b-0">
              <TableHead className="w-[100px] shrink-0">Method</TableHead>
              <TableHead className="min-w-0">URL</TableHead>
              <TableHead className="w-[100px] shrink-0">Status</TableHead>
              <TableHead className="text-right w-[100px] shrink-0">Time</TableHead>
            </TableRow>
          </TableHeader>
        </Table>
      </div>
      <ScrollArea className="flex-1 w-full min-h-0">
        <div className="relative w-full">
          <Table className="w-full table-fixed">
            <TableBody>
              {filteredEntries.map((entry, index) => (
                <TableRow 
                  key={index} 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedRequest(entry)}
                >
                  <TableCell className="w-[100px] shrink-0 py-1.5">
                    <MethodBadge method={entry.request.method} />
                  </TableCell>
                  <TableCell className="font-mono text-xs min-w-0 overflow-hidden py-1.5">
                    <div className="truncate">{entry.request.url}</div>
                  </TableCell>
                  <TableCell className="w-[100px] shrink-0 py-1.5">
                    <StatusBadge status={entry.response.status} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs w-[100px] shrink-0 py-1.5">
                    {Math.round(entry.time)}ms
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </ScrollArea>

      {/* Inspection Drawer */}
      <Sheet open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <SheetContent className="w-[800px] sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Request Details</SheetTitle>
            <SheetDescription className="break-all font-mono text-xs">
              {selectedRequest?.request.url}
            </SheetDescription>
          </SheetHeader>
          
          {selectedRequest && (
            <div className="mt-6 space-y-6">
              <Section title="Request Headers" data={selectedRequest.request.headers} />
              <Section title="Response Headers" data={selectedRequest.response.headers} />
              <BodySection title="Response Body" content={selectedRequest.response.content.text} />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

// Helper Components for clean UI
function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-blue-100 text-blue-800 hover:bg-blue-100",
    POST: "bg-green-100 text-green-800 hover:bg-green-100",
    PUT: "bg-orange-100 text-orange-800 hover:bg-orange-100",
    DELETE: "bg-red-100 text-red-800 hover:bg-red-100",
  }
  return <Badge className={colors[method] || ""} variant="outline">{method}</Badge>
}

function StatusBadge({ status }: { status: number }) {
  const color = status >= 200 && status < 300 ? "text-green-600" : "text-red-600"
  return <span className={`font-mono font-bold ${color}`}>{status}</span>
}

function Section({ title, data }: { title: string, data: { name: string, value: string }[] }) {
  return (
    <div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <div className="rounded-md border p-2 bg-muted/30 text-xs font-mono">
        {data.map((h, i) => (
          <div key={i} className="grid grid-cols-[120px_1fr] gap-2 py-1 border-b last:border-0">
            <span className="font-semibold text-muted-foreground">{h.name}:</span>
            <span className="break-all">{h.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BodySection({ title, content }: { title: string, content?: string }) {
    if (!content) return null;
    return (
        <div>
            <h3 className="font-semibold mb-2">{title}</h3>
            <ScrollArea className="h-[300px] w-full rounded-md border p-4 bg-slate-950 text-slate-50 font-mono text-xs">
                <pre>{content}</pre>
            </ScrollArea>
        </div>
    )
}
