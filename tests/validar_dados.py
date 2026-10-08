"""Valida o banco de conteúdo em public/js/data.js.

Uso: python tests/validar_dados.py
Sai com código 1 se encontrar qualquer problema.
"""
import json
import pathlib
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
REGIOES = {"br", "am", "eu", "af", "as", "oc", "mundo"}
ITENS = {"bussola", "escudo", "turbo"}
EFEITOS = {"move", "pts", "item", "skip", "extra", "collect", "loseItem", "othersMove"}


def carregar():
    texto = (RAIZ / "public" / "js" / "data.js").read_text(encoding="utf-8")
    inicio = texto.rindex("window.GEO_DATA =") + len("window.GEO_DATA =")
    corpo = texto[inicio:].strip().rstrip(";")
    return json.loads(corpo)


def validar(d):
    erros = []

    def checar(cond, msg):
        if not cond:
            erros.append(msg)

    def alternativas(o, onde):
        checar(isinstance(o, list) and len(o) == 4, f"{onde}: precisa de 4 alternativas")
        checar(len(set(o)) == len(o), f"{onde}: alternativas repetidas {o}")
        checar(all(isinstance(x, str) and x.strip() for x in o), f"{onde}: alternativa vazia")

    perguntas = set()
    for n, q in enumerate(d["quiz"]):
        onde = f"quiz[{n}] {q.get('q', '')[:40]!r}"
        checar(q.get("r") in REGIOES, f"{onde}: região inválida")
        checar(q.get("d") in (1, 2, 3), f"{onde}: dificuldade inválida")
        checar(q.get("q", "").strip(), f"{onde}: sem enunciado")
        checar(q.get("i", "").strip(), f"{onde}: sem curiosidade")
        checar(q["q"] not in perguntas, f"{onde}: pergunta duplicada")
        perguntas.add(q["q"])
        alternativas(q.get("o"), onde)

    for n, e in enumerate(d["enigmas"]):
        onde = f"enigmas[{n}]"
        checar(e.get("r") in REGIOES, f"{onde}: região inválida")
        checar(len(e.get("c", [])) == 3, f"{onde}: precisa de 3 pistas")
        alternativas(e.get("o"), onde)

    for n, v in enumerate(d["vf"]):
        checar(isinstance(v.get("v"), bool), f"vf[{n}]: 'v' deve ser booleano")
        checar(v.get("s", "").strip(), f"vf[{n}]: sem afirmação")
        if v["v"] is False:
            checar(v.get("i", "").strip(), f"vf[{n}]: afirmação falsa sem explicação")

    for n, o in enumerate(d["ordenar"]):
        checar(3 <= len(o.get("it", [])) <= 5, f"ordenar[{n}]: 3 a 5 itens")
        checar(len(set(o["it"])) == len(o["it"]), f"ordenar[{n}]: itens repetidos")

    codigos = [b["c"] for b in d["bandeiras"]]
    checar(len(set(codigos)) == len(codigos), "bandeiras: código repetido")
    for b in d["bandeiras"]:
        checar(len(b["c"]) == 2 and b["c"].islower(), f"bandeira {b}: código ISO inválido")
        checar(b.get("r") in REGIOES, f"bandeira {b}: região inválida")
        mesma = [x for x in d["bandeiras"] if x["r"] == b["r"]]
        checar(len(mesma) >= 4, f"bandeiras da região {b['r']}: menos de 4 (sem distratores)")

    for deck in ("sorte", "reves"):
        for n, c in enumerate(d[deck]):
            checar(c.get("t") and c.get("d") and c.get("icon"), f"{deck}[{n}]: campos faltando")
            checar(set(c.get("e", {})) <= EFEITOS and c.get("e"), f"{deck}[{n}]: efeito inválido")
            if "item" in c["e"]:
                checar(c["e"]["item"] in ITENS, f"{deck}[{n}]: item inválido")

    # Cada região do tabuleiro precisa de conteúdo suficiente para não repetir logo.
    for r in REGIOES - {"mundo"}:
        qtd = sum(1 for q in d["quiz"] if q["r"] == r)
        checar(qtd >= 10, f"região {r}: só {qtd} perguntas de quiz")
    return erros


if __name__ == "__main__":
    dados = carregar()
    problemas = validar(dados)
    resumo = ", ".join(f"{k}={len(v)}" for k, v in dados.items())
    if problemas:
        print("FALHOU:")
        for p in problemas:
            print("  -", p)
        sys.exit(1)
    print(f"OK — {resumo}")
