import unicodedata

import pytest

from app.core.columns import ColumnLabels, classify, normalize_label

LABELS = ColumnLabels(idea="Idée", todo="À faire", doing="En cours")


def column(labels: list[str], *, closed: bool = False, has_assignee: bool = False):
    return classify(closed=closed, labels=labels, has_assignee=has_assignee, column_labels=LABELS)


@pytest.mark.parametrize(
    ("labels", "expected"),
    [
        (["Idée"], "idea"),
        (["À faire"], "todo"),
        (["En cours"], "doing"),
        (["gameplay", "À faire"], "todo"),
    ],
)
def test_un_label_de_colonne_donne_sa_colonne(labels, expected):
    assert column(labels, has_assignee=expected == "doing") == (expected, [])


def test_une_issue_fermee_est_faite_quels_que_soient_ses_labels():
    assert column(["En cours", "À faire"], closed=True) == ("done", [])
    assert column([], closed=True) == ("done", [])


def test_sans_label_de_colonne_va_dans_les_idees_a_trier():
    assert column([]) == ("idea", ["needs_triage"])
    assert column(["gameplay", "son"]) == ("idea", ["needs_triage"])


def test_la_colonne_la_plus_avancee_gagne_et_le_conflit_est_signale():
    assert column(["Idée", "À faire"]) == ("todo", ["multiple_columns"])
    assert column(["Idée", "En cours"], has_assignee=True) == ("doing", ["multiple_columns"])
    assert column(["Idée", "À faire", "En cours"], has_assignee=True) == ("doing", ["multiple_columns"])


def test_en_cours_sans_personne_est_signale():
    assert column(["En cours"]) == ("doing", ["doing_unassigned"])


def test_a_faire_avec_quelqu_un_est_signale():
    assert column(["À faire"], has_assignee=True) == ("todo", ["todo_assigned"])


def test_une_idee_assignee_n_est_pas_une_incoherence():
    assert column(["Idée"], has_assignee=True) == ("idea", [])


def test_plusieurs_incoherences_se_cumulent():
    assert column(["À faire", "En cours"]) == ("doing", ["multiple_columns", "doing_unassigned"])


@pytest.mark.parametrize(
    "variant",
    [
        "à faire",
        "À FAIRE",
        "  À   faire ",
        unicodedata.normalize("NFD", "À faire"),  # accent décomposé
    ],
)
def test_la_comparaison_des_labels_est_tolerante(variant):
    assert column([variant]) == ("todo", [])


def test_un_label_proche_mais_different_n_est_pas_reconnu():
    assert column(["A faire"]) == ("idea", ["needs_triage"])  # sans accent : ce n'est pas le même label
    assert column(["En cours de relecture"]) == ("idea", ["needs_triage"])


def test_normalize_label():
    assert normalize_label("  IDÉE ") == "idée"
    assert normalize_label(unicodedata.normalize("NFD", "Idée")) == normalize_label("Idée")
