from datetime import UTC, date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from app.config import DeadlineConfig, load_project_config
from app.core.calendar import (
    build_deadlines,
    days_left,
    deadline_keys_by_milestone,
    is_past,
    match_milestone,
    target_date,
)
from tests import factories

PARIS = ZoneInfo("Europe/Paris")


def paris(year, month, day, hour=12, minute=0) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=PARIS)


def deadline(**kwargs) -> DeadlineConfig:
    data = {"cle": "cdst", "titre": "Remise du CdST", "semaine_du": "2026-12-07"}
    data.update(kwargs)
    return DeadlineConfig.model_validate(data)


def test_compte_a_rebours_du_cahier_des_charges():
    now = paris(2026, 11, 27, 14)
    expected = {
        date(2026, 12, 7): 10,
        date(2026, 12, 14): 17,
        date(2027, 1, 4): 38,
        date(2027, 3, 29): 122,
        date(2027, 5, 31): 185,
        date(2026, 10, 19): -39,
    }
    for target, days in expected.items():
        assert days_left(target, now, PARIS) == days


def test_le_jour_change_a_minuit_heure_de_paris_pas_utc():
    target = date(2026, 12, 7)
    # 22:59:59 UTC = 23:59:59 à Paris : on est encore le 27.
    assert days_left(target, datetime(2026, 11, 27, 22, 59, 59, tzinfo=UTC), PARIS) == 10
    # 23:00:01 UTC = 00:00:01 à Paris : on est déjà le 28.
    assert days_left(target, datetime(2026, 11, 27, 23, 0, 1, tzinfo=UTC), PARIS) == 9


def test_le_jour_j_vaut_zero_puis_devient_negatif():
    target = date(2026, 12, 7)
    assert days_left(target, paris(2026, 12, 6, 23, 59), PARIS) == 1
    assert days_left(target, paris(2026, 12, 7, 0, 0), PARIS) == 0
    assert days_left(target, paris(2026, 12, 7, 23, 59), PARIS) == 0
    assert days_left(target, paris(2026, 12, 8, 0, 0), PARIS) == -1


def test_le_passage_a_l_heure_d_ete_ne_decale_pas_le_compte():
    # Passage à l'heure d'été dans la nuit du 27 au 28 mars 2027 ; échéance le lundi 29.
    target = date(2027, 3, 29)
    assert days_left(target, paris(2027, 3, 27, 23, 30), PARIS) == 2
    assert days_left(target, paris(2027, 3, 28, 0, 30), PARIS) == 1
    assert days_left(target, paris(2027, 3, 28, 3, 30), PARIS) == 1
    assert days_left(target, paris(2027, 3, 28, 23, 59), PARIS) == 1
    # Même instant exprimé en UTC : 21:59 UTC le 28 = 23:59 à Paris (UTC+2 désormais).
    assert days_left(target, datetime(2027, 3, 28, 21, 59, tzinfo=UTC), PARIS) == 1
    assert days_left(target, datetime(2027, 3, 28, 22, 1, tzinfo=UTC), PARIS) == 0


def test_le_passage_a_l_heure_d_hiver_ne_decale_pas_le_compte():
    # Passage à l'heure d'hiver dans la nuit du 24 au 25 octobre 2026 (journée de 25 heures).
    target = date(2026, 10, 26)
    assert days_left(target, paris(2026, 10, 24, 23, 59), PARIS) == 2
    assert days_left(target, paris(2026, 10, 25, 0, 1), PARIS) == 1
    assert days_left(target, datetime(2026, 10, 25, 22, 59, tzinfo=UTC), PARIS) == 1  # 23:59 à Paris
    assert days_left(target, datetime(2026, 10, 25, 23, 1, tzinfo=UTC), PARIS) == 0


def test_la_date_exacte_remplace_le_lundi():
    assert target_date(deadline()) == date(2026, 12, 7)
    assert target_date(deadline(date_exacte="2026-12-10")) == date(2026, 12, 10)


def test_semaine_du_est_ramenee_au_lundi():
    assert deadline(semaine_du="2026-12-09").week_of == date(2026, 12, 7)
    assert deadline(semaine_du="2026-12-13").week_of == date(2026, 12, 7)
    assert deadline(semaine_du="2026-12-07").week_of == date(2026, 12, 7)


def test_une_echeance_par_semaine_n_est_passee_qu_apres_le_dimanche():
    cdst = deadline()
    assert not is_past(cdst, paris(2026, 12, 6), PARIS)
    assert not is_past(cdst, paris(2026, 12, 7), PARIS)
    assert not is_past(cdst, paris(2026, 12, 13, 23, 59), PARIS)
    assert is_past(cdst, paris(2026, 12, 14, 0, 1), PARIS)


def test_avec_une_date_exacte_l_echeance_est_passee_le_lendemain():
    exact = deadline(date_exacte="2026-12-09")
    assert not is_past(exact, paris(2026, 12, 9, 23, 0), PARIS)
    assert is_past(exact, paris(2026, 12, 10, 0, 1), PARIS)


def test_le_jalon_est_retrouve_par_son_titre_meme_ecrit_autrement():
    milestones = [factories.milestone(1, "Autre"), factories.milestone(2, "  remise du cdst ")]
    assert match_milestone(deadline(), milestones)["id"] == 2
    assert match_milestone(deadline(titre="Inconnue"), milestones) is None


def test_le_titre_de_jalon_configure_a_la_priorite():
    milestones = [factories.milestone(1, "Remise du CdST"), factories.milestone(2, "Rendu CdST")]
    assert match_milestone(deadline(jalon="Rendu CdST"), milestones)["id"] == 2


def test_cles_d_echeance_par_jalon():
    milestones = [factories.milestone(7, "Remise du CdST"), factories.milestone(8, "Sans rapport")]
    assert deadline_keys_by_milestone([deadline()], milestones) == {7: "cdst"}


def test_build_deadlines_trie_et_compte_l_avancement():
    config = factories.config()
    milestones = [factories.milestone(7, "Remise du CdST")]
    built = build_deadlines(
        config.deadlines,
        milestones,
        {7: ["done", "done", "done", "doing", "todo", "idea"]},
        now=paris(2026, 11, 27, 14),
        tz=PARIS,
    )
    assert [d.key for d in built] == ["groupes", "cdst", "soutenance-1"]
    groupes, cdst, soutenance = built
    assert groupes.past and groupes.days_left == -39 and groupes.night is None and groupes.milestone is None
    assert not cdst.past and cdst.days_left == 10 and cdst.night == 1
    assert cdst.short_title == "CdST"
    assert cdst.milestone is not None
    assert (cdst.milestone.total, cdst.milestone.closed, cdst.milestone.doing, cdst.milestone.todo) == (
        6,
        3,
        1,
        2,
    )
    assert soutenance.milestone is None and soutenance.short_title == "Première soutenance"


def test_un_jalon_sans_issue_a_un_avancement_nul():
    built = build_deadlines(
        [deadline()], [factories.milestone(7, "Remise du CdST")], {}, now=paris(2026, 11, 27), tz=PARIS
    )
    assert built[0].milestone is not None and built[0].milestone.total == 0


def test_le_calendrier_livre_correspond_au_cahier_des_charges():
    config = load_project_config(Path("config/projet.toml"))
    by_key = {d.key: d for d in config.deadlines}
    assert {key: d.week_of for key, d in by_key.items()} == {
        "groupes": date(2026, 10, 19),
        "cdst": date(2026, 12, 7),
        "validation-cdst": date(2026, 12, 14),
        "soutenance-1": date(2027, 1, 4),
        "soutenance-2": date(2027, 3, 29),
        "soutenance-finale": date(2027, 5, 31),
    }
    assert all(d.week_of.weekday() == 0 for d in config.deadlines), "chaque « semaine du » est un lundi"
    assert sorted(d.night for d in config.deadlines if d.night) == [1, 2, 3, 4, 5]
    assert by_key["groupes"].night is None
    assert [m.gitlab for m in config.members] == [
        "arthur.jeaugey",
        "theo.wu",
        "samuel.mopty",
        "louis.landanger",
        "eliott.damagnez",
    ]
    assert [d.name for d in config.domains] == ["gameplay", "profs", "3d", "son", "code", "ui", "orga"]


def test_deux_echeances_avec_la_meme_cle_sont_refusees():
    with pytest.raises(ValueError, match="même clé"):
        factories.config(
            echeances=[
                {"cle": "a", "titre": "A", "semaine_du": "2026-12-07"},
                {"cle": "a", "titre": "B", "semaine_du": "2026-12-14"},
            ]
        )
