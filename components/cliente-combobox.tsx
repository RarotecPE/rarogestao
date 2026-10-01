"use client"

import { useMemo, useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export interface ClienteOption {
  id: number | string
  nome_fantasia?: string
  razao_social?: string
}

interface ClienteComboboxProps {
  clientes: ClienteOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Rotulo da opcao que limpa a selecao (ex.: "Todos os clientes"). Se omitido, nao mostra. */
  allLabel?: string
  disabled?: boolean
  className?: string
}

function nomeDe(c: ClienteOption) {
  return c.nome_fantasia || c.razao_social || `Cliente ${c.id}`
}

/** Remove acentos e normaliza para busca (ex.: "Câmara" -> "camara"). */
function normalizar(str: string) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

/** Filtro do cmdk insensivel a acentos e maiusculas. */
function filtrarCommand(value: string, search: string) {
  return normalizar(value).includes(normalizar(search)) ? 1 : 0
}

export function ClienteCombobox({
  clientes,
  value,
  onChange,
  placeholder = "Selecione",
  allLabel,
  disabled,
  className,
}: ClienteComboboxProps) {
  const [open, setOpen] = useState(false)

  const selecionado = useMemo(() => {
    if (allLabel && (value === "all" || value === "")) return allLabel
    const c = clientes.find((x) => String(x.id) === value)
    return c ? nomeDe(c) : placeholder
  }, [clientes, value, allLabel, placeholder])

  const isPlaceholder = selecionado === placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            isPlaceholder && "text-muted-foreground dark:text-slate-300",
            className,
          )}
        >
          <span className="truncate">{selecionado}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-70 dark:opacity-90" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command filter={filtrarCommand}>
          <CommandInput placeholder="Digite para pesquisar..." />
          <CommandList>
            <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
            <CommandGroup>
              {allLabel && (
                <CommandItem
                  value={allLabel}
                  onSelect={() => {
                    onChange("all")
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === "all" || value === "" ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {allLabel}
                </CommandItem>
              )}
              {clientes.map((c) => {
                const nome = nomeDe(c)
                return (
                  <CommandItem
                    key={c.id}
                    value={nome}
                    onSelect={() => {
                      onChange(String(c.id))
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === String(c.id) ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {nome}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
