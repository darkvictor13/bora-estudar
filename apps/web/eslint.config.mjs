import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

/**
 * Substitui o `eslint-config-next`, que saiu junto com o Next.
 *
 * O que interessava daquele preset e continua valendo aqui são as regras de
 * hooks: é `react-hooks/exhaustive-deps` que pega o efeito com dependência
 * faltando, e há efeitos com ordenação sensível em QuizResultHandler.
 */
export default defineConfig([
  globalIgnores(["dist/**", "node_modules/**"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // O preset de formato flat vive em `configs.flat`. O homônimo no topo do
  // pacote ainda é eslintrc — tem `plugins` como array de string, e o ESLint 9
  // recusa com uma mensagem que não diz qual config está errada.
  reactHooks.configs.flat["recommended-latest"],
  {
    rules: {
      // `_prev` é a assinatura que useActionState exige, e o primeiro
      // argumento é ignorado de propósito em toda action.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
]);
