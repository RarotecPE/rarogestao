"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

export interface UsePaginationOptions {
  initialPageSize?: number
  pageSizeOptions?: number[]
  resetKey?: string | number
}

export interface UsePaginationResult<T> {
  paginatedItems: T[]
  page: number
  setPage: (page: number) => void
  pageSize: number
  setPageSize: (size: number) => void
  totalItems: number
  totalPages: number
  pageSizeOptions: number[]
}

export function usePagination<T>(
  items: T[] | undefined | null,
  options: UsePaginationOptions = {},
): UsePaginationResult<T> {
  const {
    initialPageSize = 20,
    pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
    resetKey,
  } = options

  const [page, setPageState] = useState(1)
  const [pageSize, setPageSizeState] = useState(initialPageSize)

  useEffect(() => {
    setPageState(1)
  }, [resetKey])

  const safeList = items ?? []
  const totalItems = safeList.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)

  useEffect(() => {
    if (page > totalPages) {
      setPageState(totalPages)
    }
  }, [page, totalPages])

  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return safeList.slice(start, start + pageSize)
  }, [safeList, safePage, pageSize])

  const setPage = (nextPage: number) => {
    setPageState(Math.min(Math.max(1, nextPage), totalPages))
  }

  const setPageSize = (nextSize: number) => {
    setPageSizeState(nextSize)
    setPageState(1)
  }

  return {
    paginatedItems,
    page: safePage,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    totalPages,
    pageSizeOptions,
  }
}

function getVisiblePages(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const pages: (number | "ellipsis")[] = [1]
  if (current > 3) pages.push("ellipsis")
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let p = start; p <= end; p++) {
    pages.push(p)
  }
  if (current < total - 2) pages.push("ellipsis")
  pages.push(total)
  return pages
}

function findScrollContainer(element: HTMLElement | null): HTMLElement | Window {
  let parent = element?.parentElement ?? null
  while (parent) {
    const style = window.getComputedStyle(parent)
    const overflowY = style.overflowY
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      parent.scrollHeight > parent.clientHeight
    ) {
      return parent
    }
    parent = parent.parentElement
  }
  return window
}

export interface ListPaginationProps {
  page: number
  pageSize: number
  totalItems: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  pageSizeOptions?: number[]
  itemLabel?: string
  hideWhenEmpty?: boolean
  hideWhenSinglePage?: boolean
  className?: string
}

export function ListPagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  itemLabel = "itens",
  hideWhenEmpty = true,
  hideWhenSinglePage = false,
  className,
}: ListPaginationProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const pendingAnchorTopRef = useRef<number | null>(null)
  const pendingScrollContainerRef = useRef<HTMLElement | Window | null>(null)

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1
  const end = Math.min(totalItems, safePage * pageSize)

  useLayoutEffect(() => {
    const anchorTop = pendingAnchorTopRef.current
    if (anchorTop === null) return
    pendingAnchorTopRef.current = null
    const container = pendingScrollContainerRef.current
    pendingScrollContainerRef.current = null

    const el = barRef.current
    if (!el) return
    const nextTop = el.getBoundingClientRect().top
    const delta = nextTop - anchorTop
    if (Math.abs(delta) > 1) {
      if (container && container !== window && container instanceof HTMLElement) {
        container.scrollBy({ top: delta, behavior: "instant" as ScrollBehavior })
      } else {
        window.scrollBy({ top: delta, behavior: "instant" as ScrollBehavior })
      }
    }
  }, [safePage, pageSize])

  if (hideWhenEmpty && totalItems === 0) return null
  if (hideWhenSinglePage && totalPages <= 1 && totalItems <= Math.min(...pageSizeOptions)) {
    return null
  }

  const captureAnchor = () => {
    const el = barRef.current
    if (!el) return
    pendingAnchorTopRef.current = el.getBoundingClientRect().top
    pendingScrollContainerRef.current = findScrollContainer(el)
  }

  const handlePageChange = (nextPage: number) => {
    if (nextPage === safePage || nextPage < 1 || nextPage > totalPages) return
    captureAnchor()
    onPageChange(nextPage)
  }

  const handlePageSizeChange = (value: string) => {
    const nextSize = Number(value)
    if (!Number.isFinite(nextSize) || nextSize <= 0 || nextSize === pageSize) return
    captureAnchor()
    onPageSizeChange(nextSize)
  }

  const visiblePages = getVisiblePages(safePage, totalPages)

  return (
    <div
      ref={barRef}
      className={cn(
        "flex flex-col gap-3 border-t bg-muted/20 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-start">
        <span className="text-xs text-muted-foreground sm:text-sm">
          Mostrando{" "}
          <span className="font-medium text-foreground">
            {start}–{end}
          </span>{" "}
          de <span className="font-medium text-foreground">{totalItems}</span> {itemLabel}
        </span>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Por página:</span>
          <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="h-8 w-[74px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {pageSizeOptions.map((opt) => (
                <SelectItem key={opt} value={String(opt)}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 px-2.5 text-xs"
            onClick={() => handlePageChange(safePage - 1)}
            disabled={safePage <= 1}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Anterior</span>
          </Button>

          <div className="flex items-center gap-1">
            {visiblePages.map((item, idx) =>
              item === "ellipsis" ? (
                <span
                  key={`ellipsis-${idx}`}
                  className="px-1.5 text-xs text-muted-foreground select-none"
                >
                  …
                </span>
              ) : (
                <Button
                  key={item}
                  type="button"
                  variant={item === safePage ? "default" : "outline"}
                  size="sm"
                  className="h-8 min-w-8 px-2 text-xs"
                  onClick={() => handlePageChange(item)}
                  aria-current={item === safePage ? "page" : undefined}
                >
                  {item}
                </Button>
              ),
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 px-2.5 text-xs"
            onClick={() => handlePageChange(safePage + 1)}
            disabled={safePage >= totalPages}
          >
            <span className="hidden sm:inline">Próxima</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}
