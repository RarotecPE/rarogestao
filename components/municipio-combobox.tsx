"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Loader2 } from "lucide-react"
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface Municipio {
  nome: string
  nomeCompleto: string
  codigo: string
}

interface MunicipioComboboxProps {
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
}

export function MunicipioCombobox({ 
  value, 
  onValueChange, 
  placeholder = "Selecione o municipio...",
}: MunicipioComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [municipios, setMunicipios] = React.useState<Municipio[]>([])
  const [loading, setLoading] = React.useState(false)

  // Busca municipios quando o usuario digita (minimo 2 caracteres)
  React.useEffect(() => {
    if (search.trim().length < 2) {
      setMunicipios([])
      return
    }
    
    const timeoutId = setTimeout(async () => {
      setLoading(true)
      try {
        // Usa nossa API interna que faz cache e filtro server-side
        const response = await fetch(
          `/api/municipios-ibge?search=${encodeURIComponent(search)}&limit=30`
        )
        const data = await response.json()
        const list = Array.isArray(data) ? data : []
        
        const formatted = list.map((m: { nome: string; id: number; uf: string; nomeCompleto: string }) => ({
          nome: m.nome,
          nomeCompleto: m.nomeCompleto,
          codigo: m.id ? m.id.toString() : m.nomeCompleto,
        }))
        
        setMunicipios(formatted)
      } catch (error) {
        console.error("Erro ao buscar municipios:", error)
        setMunicipios([])
      } finally {
        setLoading(false)
      }
    }, 300) // Debounce de 300ms
    
    return () => clearTimeout(timeoutId)
  }, [search])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {value || placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Digite para buscar..." 
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : search.length < 2 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Digite pelo menos 2 letras...
              </div>
            ) : municipios.length === 0 ? (
              <CommandEmpty>Nenhum municipio encontrado.</CommandEmpty>
            ) : (
              <CommandGroup>
                {municipios.map((municipio) => (
                  <CommandItem
                    key={municipio.codigo}
                    value={municipio.nomeCompleto}
                    onSelect={() => {
                      onValueChange(municipio.nomeCompleto)
                      setOpen(false)
                      setSearch("")
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === municipio.nomeCompleto ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {municipio.nomeCompleto}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
