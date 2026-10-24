// Compléments du référentiel (lot R3c) : utilitaires, pick-up et camions courants (type « Utilitaire »). Tour 2 : les
// ludospaces (Partner, Kangoo, Berlingo, Caddy, Doblo, Combo) sont des voitures [car] ; leurs fourgons restent en
// Utilitaire sous leur propre nom quand il existe (Kangoo Express, Berlingo Van, Caddy Van, Doblo Cargo…). Format : voir
// `vehicle-catalog.ts`. Méthode et sources : docs/JOURNAL-DES-CHOIX.md, « Lot R3c ».

export const vehicleUtility = `
@ Peugeot | FR | truck
Partner [car] : I 1996-2008 ; II 2008-2018 ; III 2018-
Expert : I 1995-2006 ; II 2007-2016 ; III 2016-
Boxer : I 1994-2006 ; II 2006-
Bipper : 2008-2017
J5 : 1981-1993
J7 : 1965-1980
J9 : 1980-1991
D3 / D4 : 1950-1965
404 Pick-up : 1967-1988
504 Pick-up : 1979-1993

@ Renault | FR | truck
Estafette : 1959-1980
Express : 1985-2000
Kangoo [car] : I 1997-2008 ; II 2008-2021 ; III 2021-
Kangoo Express : I 1997-2008 ; II 2008-2021
Kangoo Van : III 2021-
Trafic : I 1980-2001 ; II 2001-2014 ; III 2014-
Master : I 1980-1997 ; II 1997-2010 ; III 2010-2024 ; IV 2024-
Alaskan : 2017-2020
4 Fourgonnette : 1961-1993

@ Citroën | FR | truck
Acadiane : 1977-1987
C15 : 1984-2005
C25 : 1981-1994
C35 : 1974-1992
Berlingo [car] : I 1996-2008 ; II 2008-2018 ; III 2018-
Berlingo Van : III 2018-
Jumpy : I 1994-2006 ; II 2007-2016 ; III 2016-
Jumper : I 1994-2006 ; II 2006-
Nemo : 2008-2017
2CV Fourgonnette : 1951-1978

@ Dacia | RO | truck
Dokker : 2012-2021
Logan Pick-up : 2008-2012

@ Volkswagen | DE | truck
Caddy [car] : Mk1 1979-1995 ; Mk2 1995-2004 ; Mk3 2004-2015 ; Mk4 2015-2020 ; Mk5 2020-
Caddy Van : Mk3 2004-2015 ; Mk4 2015-2020
Caddy Cargo : Mk5 2020-
Crafter : I 2006-2016 ; II 2016-
LT : I 1975-1996 ; II 1996-2006
Amarok : I 2010-2020 ; II 2022-

@ Mercedes-Benz | DE | truck
Vito : W638 1996-2003 ; W639 2003-2014 ; W447 2014-
Sprinter : T1N 1995-2006 ; NCV3 2006-2018 ; VS30 2018-
Citan : I 2012-2021 ; II 2021-
Classe X : 2017-2020
T1 (Bremer) : 1977-1995
Unimog : 1948-
Actros : 1996-

@ Opel | DE | truck
Combo [car] : B 1993-2001 ; C 2001-2011 ; D 2011-2018 ; E 2018-
Combo Cargo : E 2018-
Vivaro : A 2001-2014 ; B 2014-2019 ; C 2019-
Movano : A 1998-2010 ; B 2010-2021 ; C 2021-
Blitz : 1952-1975

@ Fiat | IT | truck
Fiorino : I 1977-1988 ; II 1988-2000 ; III 2007-2024
Doblo [car] : I 2000-2010 ; II 2010-2022 ; III 2022-
Doblo Cargo : I 2000-2010 ; II 2010-2022 ; III 2022-
Scudo : I 1995-2006 ; II 2007-2016 ; III 2022-
Ducato : I 1981-1994 ; II 1994-2006 ; III 2006-
Talento : 2016-2020
Fullback : 2016-2019
238 : 1967-1983

@ Iveco | IT | truck
Daily : 1978-
Massif : 2008-2011
Stralis : 2002-2019
S-Way : 2019-

@ Ford | US | truck
Transit : Mk1 1965-1978 ; Mk2 1978-1986 ; Mk3 1986-2000 ; Mk6 2000-2006 ; Mk7 2006-2014 ; Mk8 2014-
Transit Custom : I 2012-2023 ; II 2023-
Transit Connect : I 2002-2013 ; II 2013-2022 ; III 2022-
Transit Courier : 2014-
Ranger : I 1998-2006 ; II 2006-2011 ; III 2011-2022 ; IV 2022-
F-100 : 1953-1983
F-150 : 1975-
Econoline : 1961-

@ Chevrolet | US | truck
C/K : 1960-2002
Silverado : 1998-
Colorado : 2004-

@ Dodge | US | truck
Ram : I 1981-1993 ; II 1994-2001 ; III 2002-2008
Power Wagon : 1945-1980

@ RAM | US | truck
1500 : DS 2009-2018 ; DT 2019-
TRX : 2021-2024

@ Jeep | US | truck
Gladiator : JT 2019-

@ Toyota | JP | truck
Hilux : IV 1983-1988 ; V 1988-1997 ; VI 1997-2006 ; VII 2004-2015 ; VIII 2015-2025 ; IX 2025-
HiAce : 1967-
Proace : 2013-
Proace City : 2019-
Dyna : 1959-

@ Nissan | JP | truck
Navara : D21 1985-1997 ; D22 1997-2005 ; D40 2005-2015 ; D23 2014-2022
Primastar : 2002-
Interstar : 2002-
NV200 : 2009-2022
Cabstar : 1968-
Townstar : 2022-

@ Mitsubishi | JP | truck
L200 : II 1986-1996 ; III 1996-2006 ; IV 2005-2015 ; V 2014-2023 ; VI 2023-
L300 : 1980-2013
Canter : 1963-

@ Isuzu | JP | truck
D-Max : I 2002-2012 ; II 2012-2020 ; III 2020-
NPR : 1984-

@ Hyundai | KR | truck
H-1 : 1997-2021
H350 : 2015-2021

@ Renault Trucks | FR | truck
Magnum : 1990-2013
Premium : 1996-2013
T : 2013-
Midlum : 2000-2014

@ Saviem | FR | truck
SG2 : 1965-1982
SM : 1966-1980

@ Berliet | FR | truck
GAK : 1959-1977
GBC : 1959-1978

@ Volvo | SE | truck
FH : 1993-
FM : 1998-
FL : 1985-

@ Scania | SE | truck
Série R : 2004-
Série S : 2016-
Série 143 : 1988-1996

@ DAF | NL | truck
XF : 1997-
CF : 1992-
LF : 2001-

@ MAN | DE | truck
TGX : 2007-
TGE : 2017-
TGL : 2005-

@ Piaggio | IT | truck
Porter : 1992-
Ape : 1948-

@ Goupil | FR | truck
G4 : 2014-
`;
