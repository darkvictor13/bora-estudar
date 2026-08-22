export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      aluno_preferencias: {
        Row: {
          aluno_id: string
          atualizado_em: string
          ciclo_config: Json
          revisao_config: Json
          tema: string
        }
        Insert: {
          aluno_id: string
          atualizado_em?: string
          ciclo_config?: Json
          revisao_config?: Json
          tema?: string
        }
        Update: {
          aluno_id?: string
          atualizado_em?: string
          ciclo_config?: Json
          revisao_config?: Json
          tema?: string
        }
        Relationships: [
          {
            foreignKeyName: "aluno_preferencias_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: true
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      assinaturas: {
        Row: {
          aluno_id: string
          atualizado_em: string
          criado_em: string
          cupom_id: string | null
          id: string
          plano: string
          status: Database["public"]["Enums"]["status_acesso"]
          vigencia: unknown
        }
        Insert: {
          aluno_id: string
          atualizado_em?: string
          criado_em?: string
          cupom_id?: string | null
          id?: string
          plano?: string
          status?: Database["public"]["Enums"]["status_acesso"]
          vigencia?: unknown
        }
        Update: {
          aluno_id?: string
          atualizado_em?: string
          criado_em?: string
          cupom_id?: string | null
          id?: string
          plano?: string
          status?: Database["public"]["Enums"]["status_acesso"]
          vigencia?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_cupom_id_fkey"
            columns: ["cupom_id"]
            isOneToOne: false
            referencedRelation: "cupons"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria: {
        Row: {
          acao: string
          ator_id: string | null
          id: number
          motivo: string | null
          ocorrido_em: string
          registro_id: string
          tabela: string
          valor_anterior: Json | null
          valor_novo: Json | null
        }
        Insert: {
          acao: string
          ator_id?: string | null
          id?: never
          motivo?: string | null
          ocorrido_em?: string
          registro_id: string
          tabela: string
          valor_anterior?: Json | null
          valor_novo?: Json | null
        }
        Update: {
          acao?: string
          ator_id?: string | null
          id?: never
          motivo?: string | null
          ocorrido_em?: string
          registro_id?: string
          tabela?: string
          valor_anterior?: Json | null
          valor_novo?: Json | null
        }
        Relationships: []
      }
      bateria_questoes: {
        Row: {
          bateria_id: string
          fase: Database["public"]["Enums"]["fase_questao"]
          id: string
          ordem_execucao: number
          origem_questao_id: number | null
          questao_id: number
          registrado_em: string
          respondida_em: string
          resultado: Database["public"]["Enums"]["resultado_questao"]
          rodada: number
          topico: string | null
        }
        Insert: {
          bateria_id: string
          fase: Database["public"]["Enums"]["fase_questao"]
          id?: string
          ordem_execucao: number
          origem_questao_id?: number | null
          questao_id: number
          registrado_em?: string
          respondida_em: string
          resultado: Database["public"]["Enums"]["resultado_questao"]
          rodada?: number
          topico?: string | null
        }
        Update: {
          bateria_id?: string
          fase?: Database["public"]["Enums"]["fase_questao"]
          id?: string
          ordem_execucao?: number
          origem_questao_id?: number | null
          questao_id?: number
          registrado_em?: string
          respondida_em?: string
          resultado?: Database["public"]["Enums"]["resultado_questao"]
          rodada?: number
          topico?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bateria_questoes_bateria_id_fkey"
            columns: ["bateria_id"]
            isOneToOne: false
            referencedRelation: "baterias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bateria_questoes_bateria_id_fkey"
            columns: ["bateria_id"]
            isOneToOne: false
            referencedRelation: "vw_bateria_desempenho"
            referencedColumns: ["bateria_id"]
          },
        ]
      }
      baterias: {
        Row: {
          aluno_id: string
          anulada_em: string | null
          anulada_por: string | null
          atualizado_em: string
          bloco_id: string
          cancelada_em: string | null
          concluida_em: string | null
          finalizacao_id: string | null
          finalizada_em: string | null
          id: string
          iniciada_em: string
          meta_id: string | null
          motivo_anulacao: string | null
          numero_bateria: number | null
          origem: Database["public"]["Enums"]["origem_bateria"]
          planejamento_id: string
          principais_alvo: number
          professor_id: string
          sequencia_execucao: number
          status: Database["public"]["Enums"]["status_bateria"]
          tempo_minutos: number | null
        }
        Insert: {
          aluno_id: string
          anulada_em?: string | null
          anulada_por?: string | null
          atualizado_em?: string
          bloco_id: string
          cancelada_em?: string | null
          concluida_em?: string | null
          finalizacao_id?: string | null
          finalizada_em?: string | null
          id?: string
          iniciada_em?: string
          meta_id?: string | null
          motivo_anulacao?: string | null
          numero_bateria?: number | null
          origem?: Database["public"]["Enums"]["origem_bateria"]
          planejamento_id: string
          principais_alvo?: number
          professor_id: string
          sequencia_execucao: number
          status?: Database["public"]["Enums"]["status_bateria"]
          tempo_minutos?: number | null
        }
        Update: {
          aluno_id?: string
          anulada_em?: string | null
          anulada_por?: string | null
          atualizado_em?: string
          bloco_id?: string
          cancelada_em?: string | null
          concluida_em?: string | null
          finalizacao_id?: string | null
          finalizada_em?: string | null
          id?: string
          iniciada_em?: string
          meta_id?: string | null
          motivo_anulacao?: string | null
          numero_bateria?: number | null
          origem?: Database["public"]["Enums"]["origem_bateria"]
          planejamento_id?: string
          principais_alvo?: number
          professor_id?: string
          sequencia_execucao?: number
          status?: Database["public"]["Enums"]["status_bateria"]
          tempo_minutos?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bateria_bloco_fk"
            columns: ["bloco_id", "planejamento_id", "aluno_id"]
            isOneToOne: false
            referencedRelation: "planejamento_blocos"
            referencedColumns: ["id", "planejamento_id", "aluno_id"]
          },
          {
            foreignKeyName: "bateria_contexto_fk"
            columns: ["planejamento_id", "aluno_id", "professor_id"]
            isOneToOne: false
            referencedRelation: "planejamentos"
            referencedColumns: ["id", "aluno_id", "professor_id"]
          },
          {
            foreignKeyName: "baterias_anulada_por_fkey"
            columns: ["anulada_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baterias_meta_id_fkey"
            columns: ["meta_id"]
            isOneToOne: false
            referencedRelation: "metas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baterias_meta_id_fkey"
            columns: ["meta_id"]
            isOneToOne: false
            referencedRelation: "vw_meta_desempenho"
            referencedColumns: ["meta_id"]
          },
        ]
      }
      catalogo_blocos: {
        Row: {
          ativo: boolean
          atualizado_em: string
          bloco_chave: string
          catalogo_chave: string
          criado_em: string
          disciplina_chave: string
          disciplina_nome: string
          id: string
          nome: string
          numero: number
          questoes_qtd: number
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          bloco_chave: string
          catalogo_chave: string
          criado_em?: string
          disciplina_chave: string
          disciplina_nome: string
          id?: string
          nome: string
          numero: number
          questoes_qtd?: number
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          bloco_chave?: string
          catalogo_chave?: string
          criado_em?: string
          disciplina_chave?: string
          disciplina_nome?: string
          id?: string
          nome?: string
          numero?: number
          questoes_qtd?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalogo_blocos_catalogo_chave_fkey"
            columns: ["catalogo_chave"]
            isOneToOne: false
            referencedRelation: "catalogos"
            referencedColumns: ["chave"]
          },
        ]
      }
      catalogo_questoes: {
        Row: {
          bloco_id: string
          posicao: number
          questao_id: number
          topico: string
        }
        Insert: {
          bloco_id: string
          posicao: number
          questao_id: number
          topico: string
        }
        Update: {
          bloco_id?: string
          posicao?: number
          questao_id?: number
          topico?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalogo_questoes_bloco_id_fkey"
            columns: ["bloco_id"]
            isOneToOne: false
            referencedRelation: "catalogo_blocos"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogos: {
        Row: {
          ativo: boolean
          chave: string
          criado_em: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          chave: string
          criado_em?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          chave?: string
          criado_em?: string
          nome?: string
        }
        Relationships: []
      }
      ciclos_revisao: {
        Row: {
          aluno_id: string
          bloco_id: string
          concluido_em: string
          cutoff: string
          id: string
          reforco_id: string | null
        }
        Insert: {
          aluno_id: string
          bloco_id: string
          concluido_em?: string
          cutoff: string
          id?: string
          reforco_id?: string | null
        }
        Update: {
          aluno_id?: string
          bloco_id?: string
          concluido_em?: string
          cutoff?: string
          id?: string
          reforco_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ciclos_revisao_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ciclos_revisao_bloco_id_fkey"
            columns: ["bloco_id"]
            isOneToOne: false
            referencedRelation: "planejamento_blocos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ciclos_revisao_reforco_id_fkey"
            columns: ["reforco_id"]
            isOneToOne: false
            referencedRelation: "reforcos"
            referencedColumns: ["id"]
          },
        ]
      }
      cupons: {
        Row: {
          ativo: boolean
          codigo: string
          criado_em: string
          id: string
          meses: number
          usos_atuais: number
          usos_maximos: number | null
          valido_ate: string | null
        }
        Insert: {
          ativo?: boolean
          codigo: string
          criado_em?: string
          id?: string
          meses: number
          usos_atuais?: number
          usos_maximos?: number | null
          valido_ate?: string | null
        }
        Update: {
          ativo?: boolean
          codigo?: string
          criado_em?: string
          id?: string
          meses?: number
          usos_atuais?: number
          usos_maximos?: number | null
          valido_ate?: string | null
        }
        Relationships: []
      }
      lista_espera: {
        Row: {
          aluno_id: string
          area_interesse: string | null
          atualizado_em: string
          concurso_foco: string | null
          criado_em: string
          data_nascimento: string | null
          email: string
          fuso_horario: string | null
          nome: string
          professor_id: string | null
          status: string
          whatsapp: string | null
        }
        Insert: {
          aluno_id: string
          area_interesse?: string | null
          atualizado_em?: string
          concurso_foco?: string | null
          criado_em?: string
          data_nascimento?: string | null
          email: string
          fuso_horario?: string | null
          nome: string
          professor_id?: string | null
          status?: string
          whatsapp?: string | null
        }
        Update: {
          aluno_id?: string
          area_interesse?: string | null
          atualizado_em?: string
          concurso_foco?: string | null
          criado_em?: string
          data_nascimento?: string | null
          email?: string
          fuso_horario?: string | null
          nome?: string
          professor_id?: string | null
          status?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lista_espera_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: true
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_espera_professor_id_fkey"
            columns: ["professor_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      lotes_planejamento: {
        Row: {
          aplicado_em: string
          aplicado_por: string
          id: string
          metas_qtd: number
          modo: Database["public"]["Enums"]["modo_lote"]
          planejamento_id: string
          semana_numero: number
        }
        Insert: {
          aplicado_em?: string
          aplicado_por: string
          id: string
          metas_qtd: number
          modo: Database["public"]["Enums"]["modo_lote"]
          planejamento_id: string
          semana_numero: number
        }
        Update: {
          aplicado_em?: string
          aplicado_por?: string
          id?: string
          metas_qtd?: number
          modo?: Database["public"]["Enums"]["modo_lote"]
          planejamento_id?: string
          semana_numero?: number
        }
        Relationships: [
          {
            foreignKeyName: "lotes_planejamento_aplicado_por_fkey"
            columns: ["aplicado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_planejamento_planejamento_id_fkey"
            columns: ["planejamento_id"]
            isOneToOne: false
            referencedRelation: "planejamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      metas: {
        Row: {
          aluno_id: string
          atividade_extra: string | null
          atualizado_em: string
          bloco_id: string | null
          concluida_em: string | null
          criado_em: string
          criado_por: string
          dia_semana: number
          excluido_em: string | null
          id: string
          link_externo: string | null
          lote_id: string | null
          meta_origem_id: string | null
          observacao_aluno: string | null
          observacao_professor: string | null
          ordem_dia: number
          origem_semana: number | null
          planejamento_id: string
          professor_id: string
          reforco_ignorado: boolean
          semana_numero: number
          status: Database["public"]["Enums"]["status_meta"]
          tempo_previsto_min: number | null
          tipo: Database["public"]["Enums"]["tipo_meta"]
          titulo: string
        }
        Insert: {
          aluno_id: string
          atividade_extra?: string | null
          atualizado_em?: string
          bloco_id?: string | null
          concluida_em?: string | null
          criado_em?: string
          criado_por: string
          dia_semana: number
          excluido_em?: string | null
          id?: string
          link_externo?: string | null
          lote_id?: string | null
          meta_origem_id?: string | null
          observacao_aluno?: string | null
          observacao_professor?: string | null
          ordem_dia: number
          origem_semana?: number | null
          planejamento_id: string
          professor_id: string
          reforco_ignorado?: boolean
          semana_numero: number
          status?: Database["public"]["Enums"]["status_meta"]
          tempo_previsto_min?: number | null
          tipo: Database["public"]["Enums"]["tipo_meta"]
          titulo: string
        }
        Update: {
          aluno_id?: string
          atividade_extra?: string | null
          atualizado_em?: string
          bloco_id?: string | null
          concluida_em?: string | null
          criado_em?: string
          criado_por?: string
          dia_semana?: number
          excluido_em?: string | null
          id?: string
          link_externo?: string | null
          lote_id?: string | null
          meta_origem_id?: string | null
          observacao_aluno?: string | null
          observacao_professor?: string | null
          ordem_dia?: number
          origem_semana?: number | null
          planejamento_id?: string
          professor_id?: string
          reforco_ignorado?: boolean
          semana_numero?: number
          status?: Database["public"]["Enums"]["status_meta"]
          tempo_previsto_min?: number | null
          tipo?: Database["public"]["Enums"]["tipo_meta"]
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_bloco_fk"
            columns: ["bloco_id", "planejamento_id", "aluno_id"]
            isOneToOne: false
            referencedRelation: "planejamento_blocos"
            referencedColumns: ["id", "planejamento_id", "aluno_id"]
          },
          {
            foreignKeyName: "meta_contexto_fk"
            columns: ["planejamento_id", "aluno_id", "professor_id"]
            isOneToOne: false
            referencedRelation: "planejamentos"
            referencedColumns: ["id", "aluno_id", "professor_id"]
          },
          {
            foreignKeyName: "metas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_planejamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_meta_origem_id_fkey"
            columns: ["meta_origem_id"]
            isOneToOne: false
            referencedRelation: "metas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_meta_origem_id_fkey"
            columns: ["meta_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_meta_desempenho"
            referencedColumns: ["meta_id"]
          },
        ]
      }
      operacoes: {
        Row: {
          alvo_id: string | null
          ator_id: string
          criado_em: string
          operacao: string
          payload_hash: string
          request_id: string
          resultado: Json | null
        }
        Insert: {
          alvo_id?: string | null
          ator_id: string
          criado_em?: string
          operacao: string
          payload_hash: string
          request_id: string
          resultado?: Json | null
        }
        Update: {
          alvo_id?: string | null
          ator_id?: string
          criado_em?: string
          operacao?: string
          payload_hash?: string
          request_id?: string
          resultado?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "operacoes_ator_id_fkey"
            columns: ["ator_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis: {
        Row: {
          atualizado_em: string
          criado_em: string
          email_contato: string | null
          id: string
          nome: string
          papel: Database["public"]["Enums"]["papel_usuario"]
          telefone: string | null
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          email_contato?: string | null
          id: string
          nome: string
          papel?: Database["public"]["Enums"]["papel_usuario"]
          telefone?: string | null
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          email_contato?: string | null
          id?: string
          nome?: string
          papel?: Database["public"]["Enums"]["papel_usuario"]
          telefone?: string | null
        }
        Relationships: []
      }
      planejamento_blocos: {
        Row: {
          aluno_id: string
          ativo: boolean
          atualizado_em: string
          catalogo_bloco_id: string | null
          criado_em: string
          disciplina_cor: string
          disciplina_meta: number
          disciplina_nome: string
          excluido_em: string | null
          id: string
          link: string | null
          nome: string
          ordem_bloco: number
          ordem_disciplina: number
          planejamento_id: string
          professor_id: string
          questoes_qtd: number
        }
        Insert: {
          aluno_id: string
          ativo?: boolean
          atualizado_em?: string
          catalogo_bloco_id?: string | null
          criado_em?: string
          disciplina_cor?: string
          disciplina_meta?: number
          disciplina_nome: string
          excluido_em?: string | null
          id?: string
          link?: string | null
          nome: string
          ordem_bloco: number
          ordem_disciplina: number
          planejamento_id: string
          professor_id: string
          questoes_qtd?: number
        }
        Update: {
          aluno_id?: string
          ativo?: boolean
          atualizado_em?: string
          catalogo_bloco_id?: string | null
          criado_em?: string
          disciplina_cor?: string
          disciplina_meta?: number
          disciplina_nome?: string
          excluido_em?: string | null
          id?: string
          link?: string | null
          nome?: string
          ordem_bloco?: number
          ordem_disciplina?: number
          planejamento_id?: string
          professor_id?: string
          questoes_qtd?: number
        }
        Relationships: [
          {
            foreignKeyName: "planejamento_bloco_contexto_fk"
            columns: ["planejamento_id", "aluno_id", "professor_id"]
            isOneToOne: false
            referencedRelation: "planejamentos"
            referencedColumns: ["id", "aluno_id", "professor_id"]
          },
          {
            foreignKeyName: "planejamento_blocos_catalogo_bloco_id_fkey"
            columns: ["catalogo_bloco_id"]
            isOneToOne: false
            referencedRelation: "catalogo_blocos"
            referencedColumns: ["id"]
          },
        ]
      }
      planejamentos: {
        Row: {
          aluno_id: string
          area: string | null
          atualizado_em: string
          concurso_alvo: string | null
          criado_em: string
          data_inicio: string
          excluido_em: string | null
          fase: string | null
          id: string
          metas_semanais: number
          modelo_estudo: string | null
          nome: string
          professor_id: string
          status: Database["public"]["Enums"]["status_planejamento"]
        }
        Insert: {
          aluno_id: string
          area?: string | null
          atualizado_em?: string
          concurso_alvo?: string | null
          criado_em?: string
          data_inicio?: string
          excluido_em?: string | null
          fase?: string | null
          id?: string
          metas_semanais?: number
          modelo_estudo?: string | null
          nome: string
          professor_id: string
          status?: Database["public"]["Enums"]["status_planejamento"]
        }
        Update: {
          aluno_id?: string
          area?: string | null
          atualizado_em?: string
          concurso_alvo?: string | null
          criado_em?: string
          data_inicio?: string
          excluido_em?: string | null
          fase?: string | null
          id?: string
          metas_semanais?: number
          modelo_estudo?: string | null
          nome?: string
          professor_id?: string
          status?: Database["public"]["Enums"]["status_planejamento"]
        }
        Relationships: [
          {
            foreignKeyName: "planejamentos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planejamentos_professor_id_fkey"
            columns: ["professor_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      reforco_baterias: {
        Row: {
          bateria_id: string
          reforco_id: string
        }
        Insert: {
          bateria_id: string
          reforco_id: string
        }
        Update: {
          bateria_id?: string
          reforco_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reforco_baterias_bateria_id_fkey"
            columns: ["bateria_id"]
            isOneToOne: true
            referencedRelation: "baterias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reforco_baterias_bateria_id_fkey"
            columns: ["bateria_id"]
            isOneToOne: true
            referencedRelation: "vw_bateria_desempenho"
            referencedColumns: ["bateria_id"]
          },
          {
            foreignKeyName: "reforco_baterias_reforco_id_fkey"
            columns: ["reforco_id"]
            isOneToOne: false
            referencedRelation: "reforcos"
            referencedColumns: ["id"]
          },
        ]
      }
      reforco_questoes: {
        Row: {
          fase: Database["public"]["Enums"]["fase_questao"]
          questao_id: number
          reforco_id: string
          resultado: Database["public"]["Enums"]["resultado_questao"]
          topico: string | null
        }
        Insert: {
          fase: Database["public"]["Enums"]["fase_questao"]
          questao_id: number
          reforco_id: string
          resultado: Database["public"]["Enums"]["resultado_questao"]
          topico?: string | null
        }
        Update: {
          fase?: Database["public"]["Enums"]["fase_questao"]
          questao_id?: number
          reforco_id?: string
          resultado?: Database["public"]["Enums"]["resultado_questao"]
          topico?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reforco_questoes_reforco_id_fkey"
            columns: ["reforco_id"]
            isOneToOne: false
            referencedRelation: "reforcos"
            referencedColumns: ["id"]
          },
        ]
      }
      reforcos: {
        Row: {
          aluno_id: string
          bloco_id: string
          concluido_em: string
          criado_em: string
          cutoff: string
          desempenho_origem: number
          id: string
          planejamento_id: string
          professor_id: string
          request_id: string
        }
        Insert: {
          aluno_id: string
          bloco_id: string
          concluido_em?: string
          criado_em?: string
          cutoff: string
          desempenho_origem: number
          id?: string
          planejamento_id: string
          professor_id: string
          request_id: string
        }
        Update: {
          aluno_id?: string
          bloco_id?: string
          concluido_em?: string
          criado_em?: string
          cutoff?: string
          desempenho_origem?: number
          id?: string
          planejamento_id?: string
          professor_id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reforco_bloco_fk"
            columns: ["bloco_id", "planejamento_id", "aluno_id"]
            isOneToOne: false
            referencedRelation: "planejamento_blocos"
            referencedColumns: ["id", "planejamento_id", "aluno_id"]
          },
          {
            foreignKeyName: "reforco_contexto_fk"
            columns: ["planejamento_id", "aluno_id", "professor_id"]
            isOneToOne: false
            referencedRelation: "planejamentos"
            referencedColumns: ["id", "aluno_id", "professor_id"]
          },
        ]
      }
      vinculos_aluno_professor: {
        Row: {
          aluno_id: string
          criado_em: string
          encerrado_em: string | null
          id: string
          iniciado_em: string
          professor_id: string
        }
        Insert: {
          aluno_id: string
          criado_em?: string
          encerrado_em?: string | null
          id?: string
          iniciado_em?: string
          professor_id: string
        }
        Update: {
          aluno_id?: string
          criado_em?: string
          encerrado_em?: string | null
          id?: string
          iniciado_em?: string
          professor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vinculos_aluno_professor_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_aluno_professor_professor_id_fkey"
            columns: ["professor_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vw_bateria_desempenho: {
        Row: {
          aluno_id: string | null
          bateria_id: string | null
          bloco_id: string | null
          extras_acertos: number | null
          extras_qtd: number | null
          meta_id: string | null
          planejamento_id: string | null
          principais_acertos: number | null
          principais_alvo: number | null
          principais_erros: number | null
          principais_qtd: number | null
          professor_id: string | null
          reforcos_acertos: number | null
          reforcos_qtd: number | null
          status: Database["public"]["Enums"]["status_bateria"] | null
          tempo_minutos: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bateria_bloco_fk"
            columns: ["bloco_id", "planejamento_id", "aluno_id"]
            isOneToOne: false
            referencedRelation: "planejamento_blocos"
            referencedColumns: ["id", "planejamento_id", "aluno_id"]
          },
          {
            foreignKeyName: "bateria_contexto_fk"
            columns: ["planejamento_id", "aluno_id", "professor_id"]
            isOneToOne: false
            referencedRelation: "planejamentos"
            referencedColumns: ["id", "aluno_id", "professor_id"]
          },
          {
            foreignKeyName: "baterias_meta_id_fkey"
            columns: ["meta_id"]
            isOneToOne: false
            referencedRelation: "metas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baterias_meta_id_fkey"
            columns: ["meta_id"]
            isOneToOne: false
            referencedRelation: "vw_meta_desempenho"
            referencedColumns: ["meta_id"]
          },
        ]
      }
      vw_bloco_desempenho: {
        Row: {
          aluno_id: string | null
          baterias_qtd: number | null
          bloco_id: string | null
          desempenho_pct: number | null
          planejamento_id: string | null
          principais_acertos: number | null
          principais_qtd: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bateria_bloco_fk"
            columns: ["bloco_id", "planejamento_id", "aluno_id"]
            isOneToOne: false
            referencedRelation: "planejamento_blocos"
            referencedColumns: ["id", "planejamento_id", "aluno_id"]
          },
        ]
      }
      vw_meta_desempenho: {
        Row: {
          acertos: number | null
          aluno_id: string | null
          meta_id: string | null
          planejamento_id: string | null
          professor_id: string | null
          questoes_feitas: number | null
          status: Database["public"]["Enums"]["status_meta"] | null
          tempo_gasto_min: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_contexto_fk"
            columns: ["planejamento_id", "aluno_id", "professor_id"]
            isOneToOne: false
            referencedRelation: "planejamentos"
            referencedColumns: ["id", "aluno_id", "professor_id"]
          },
        ]
      }
      vw_questoes_vistas: {
        Row: {
          acertos: number | null
          aluno_id: string | null
          bloco_id: string | null
          erros: number | null
          planejamento_id: string | null
          questao_id: number | null
          ultima_vez: string | null
          vezes_vista: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bateria_bloco_fk"
            columns: ["bloco_id", "planejamento_id", "aluno_id"]
            isOneToOne: false
            referencedRelation: "planejamento_blocos"
            referencedColumns: ["id", "planejamento_id", "aluno_id"]
          },
        ]
      }
    }
    Functions: {
      anular_bateria: {
        Args: { p_bateria_id: string; p_motivo?: string; p_request_id: string }
        Returns: {
          aluno_id: string
          anulada_em: string | null
          anulada_por: string | null
          atualizado_em: string
          bloco_id: string
          cancelada_em: string | null
          concluida_em: string | null
          finalizacao_id: string | null
          finalizada_em: string | null
          id: string
          iniciada_em: string
          meta_id: string | null
          motivo_anulacao: string | null
          numero_bateria: number | null
          origem: Database["public"]["Enums"]["origem_bateria"]
          planejamento_id: string
          principais_alvo: number
          professor_id: string
          sequencia_execucao: number
          status: Database["public"]["Enums"]["status_bateria"]
          tempo_minutos: number | null
        }
        SetofOptions: {
          from: "*"
          to: "baterias"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      aplicar_lote_planejamento: {
        Args: {
          p_lote_id: string
          p_metas: Json
          p_modo: Database["public"]["Enums"]["modo_lote"]
          p_planejamento_id: string
          p_semana: number
        }
        Returns: Json
      }
      ativar_planejamento: {
        Args: { p_planejamento_id: string }
        Returns: {
          aluno_id: string
          area: string | null
          atualizado_em: string
          concurso_alvo: string | null
          criado_em: string
          data_inicio: string
          excluido_em: string | null
          fase: string | null
          id: string
          metas_semanais: number
          modelo_estudo: string | null
          nome: string
          professor_id: string
          status: Database["public"]["Enums"]["status_planejamento"]
        }
        SetofOptions: {
          from: "*"
          to: "planejamentos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      eh_professor: { Args: never; Returns: boolean }
      eh_professor_de: { Args: { p_aluno_id: string }; Returns: boolean }
      finalizar_bateria: {
        Args: {
          p_bateria_id: string
          p_cancelar?: boolean
          p_request_id: string
          p_resultados: Json
        }
        Returns: {
          aluno_id: string
          anulada_em: string | null
          anulada_por: string | null
          atualizado_em: string
          bloco_id: string
          cancelada_em: string | null
          concluida_em: string | null
          finalizacao_id: string | null
          finalizada_em: string | null
          id: string
          iniciada_em: string
          meta_id: string | null
          motivo_anulacao: string | null
          numero_bateria: number | null
          origem: Database["public"]["Enums"]["origem_bateria"]
          planejamento_id: string
          principais_alvo: number
          professor_id: string
          sequencia_execucao: number
          status: Database["public"]["Enums"]["status_bateria"]
          tempo_minutos: number | null
        }
        SetofOptions: {
          from: "*"
          to: "baterias"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      iniciar_bateria: {
        Args: {
          p_bloco_id: string
          p_meta_id: string
          p_planejamento_id: string
        }
        Returns: {
          aluno_id: string
          anulada_em: string | null
          anulada_por: string | null
          atualizado_em: string
          bloco_id: string
          cancelada_em: string | null
          concluida_em: string | null
          finalizacao_id: string | null
          finalizada_em: string | null
          id: string
          iniciada_em: string
          meta_id: string | null
          motivo_anulacao: string | null
          numero_bateria: number | null
          origem: Database["public"]["Enums"]["origem_bateria"]
          planejamento_id: string
          principais_alvo: number
          professor_id: string
          sequencia_execucao: number
          status: Database["public"]["Enums"]["status_bateria"]
          tempo_minutos: number | null
        }
        SetofOptions: {
          from: "*"
          to: "baterias"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pode_ver_contexto: {
        Args: { p_aluno_id: string; p_professor_id: string }
        Returns: boolean
      }
      registrar_reforco: {
        Args: {
          p_baterias: string[]
          p_bloco_id: string
          p_planejamento_id: string
          p_request_id: string
          p_resultados: Json
        }
        Returns: {
          aluno_id: string
          bloco_id: string
          concluido_em: string
          criado_em: string
          cutoff: string
          desempenho_origem: number
          id: string
          planejamento_id: string
          professor_id: string
          request_id: string
        }
        SetofOptions: {
          from: "*"
          to: "reforcos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      registrar_tempo_bateria: {
        Args: {
          p_bateria_id: string
          p_request_id: string
          p_tempo_minutos: number
        }
        Returns: {
          aluno_id: string
          anulada_em: string | null
          anulada_por: string | null
          atualizado_em: string
          bloco_id: string
          cancelada_em: string | null
          concluida_em: string | null
          finalizacao_id: string | null
          finalizada_em: string | null
          id: string
          iniciada_em: string
          meta_id: string | null
          motivo_anulacao: string | null
          numero_bateria: number | null
          origem: Database["public"]["Enums"]["origem_bateria"]
          planejamento_id: string
          principais_alvo: number
          professor_id: string
          sequencia_execucao: number
          status: Database["public"]["Enums"]["status_bateria"]
          tempo_minutos: number | null
        }
        SetofOptions: {
          from: "*"
          to: "baterias"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reservar_operacao: {
        Args: {
          p_alvo_id: string
          p_operacao: string
          p_payload: string
          p_request_id: string
        }
        Returns: Record<string, unknown>
      }
    }
    Enums: {
      fase_questao: "principal" | "reforco" | "extra"
      modo_lote: "acrescentar" | "substituir" | "replanejar"
      origem_bateria: "meta" | "caderno_erros"
      papel_usuario: "aluno" | "professor" | "admin"
      resultado_questao: "acertou" | "errou"
      status_acesso: "pendente" | "ativo" | "suspenso" | "expirado"
      status_bateria:
        | "em_andamento"
        | "aguardando_tempo"
        | "concluida"
        | "cancelada"
        | "anulada"
      status_meta:
        | "pendente"
        | "em_andamento"
        | "concluida"
        | "pulada"
        | "cancelada"
      status_planejamento: "rascunho" | "ativo" | "pausado" | "arquivado"
      tipo_meta: "teoria" | "bloco_questoes" | "reforco" | "estudo_extra"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      fase_questao: ["principal", "reforco", "extra"],
      modo_lote: ["acrescentar", "substituir", "replanejar"],
      origem_bateria: ["meta", "caderno_erros"],
      papel_usuario: ["aluno", "professor", "admin"],
      resultado_questao: ["acertou", "errou"],
      status_acesso: ["pendente", "ativo", "suspenso", "expirado"],
      status_bateria: [
        "em_andamento",
        "aguardando_tempo",
        "concluida",
        "cancelada",
        "anulada",
      ],
      status_meta: [
        "pendente",
        "em_andamento",
        "concluida",
        "pulada",
        "cancelada",
      ],
      status_planejamento: ["rascunho", "ativo", "pausado", "arquivado"],
      tipo_meta: ["teoria", "bloco_questoes", "reforco", "estudo_extra"],
    },
  },
} as const

