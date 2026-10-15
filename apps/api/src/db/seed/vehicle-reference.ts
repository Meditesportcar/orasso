// Référentiel véhicules de départ (seed). Source et méthode : voir docs/JOURNAL-DES-CHOIX.md (lot 05).
// Les lignes « Autre » (marque, modèle, génération) sont ajoutées par le seed : ne pas les écrire ici.

export type RefGeneration = { name: string; yearFrom: number; yearTo: number | null };
export type RefModel = { name: string; type: "car" | "moto" | "truck"; generations: RefGeneration[] };
export type RefMake = { name: string; country: string; models: RefModel[] };

export const vehicleReference: RefMake[] = [
  {
    name: "Abarth",
    country: "IT",
    models: [
      {
        name: "595",
        type: "car",
        generations: [
          { name: "Phase 1", yearFrom: 2008, yearTo: 2016 },
          { name: "Phase 2", yearFrom: 2016, yearTo: null },
        ],
      },
    ],
  },
  {
    name: "Alfa Romeo",
    country: "IT",
    models: [
      {
        name: "Giulia",
        type: "car",
        generations: [
          { name: "105", yearFrom: 1962, yearTo: 1978 },
          { name: "952", yearFrom: 2015, yearTo: null },
        ],
      },
      {
        name: "Spider",
        type: "car",
        generations: [
          { name: "Duetto", yearFrom: 1966, yearTo: 1969 },
          { name: "Coda Tronca", yearFrom: 1970, yearTo: 1982 },
          { name: "Série 3", yearFrom: 1983, yearTo: 1989 },
          { name: "Série 4", yearFrom: 1990, yearTo: 1993 },
        ],
      },
      {
        name: "GTV",
        type: "car",
        generations: [{ name: "916", yearFrom: 1995, yearTo: 2005 }],
      },
      {
        name: "147",
        type: "car",
        generations: [{ name: "937", yearFrom: 2000, yearTo: 2010 }],
      },
      {
        name: "156",
        type: "car",
        generations: [{ name: "932", yearFrom: 1997, yearTo: 2005 }],
      },
      {
        name: "Giulietta",
        type: "car",
        generations: [{ name: "940", yearFrom: 2010, yearTo: 2020 }],
      },
      {
        name: "MiTo",
        type: "car",
        generations: [{ name: "955", yearFrom: 2008, yearTo: 2018 }],
      },
    ],
  },
  {
    name: "Alpine",
    country: "FR",
    models: [
      {
        name: "A110",
        type: "car",
        generations: [
          { name: "Berlinette", yearFrom: 1962, yearTo: 1977 },
          { name: "Moderne", yearFrom: 2017, yearTo: null },
        ],
      },
      {
        name: "A310",
        type: "car",
        generations: [{ name: "V6", yearFrom: 1976, yearTo: 1985 }],
      },
      {
        name: "GTA",
        type: "car",
        generations: [{ name: "V6 Turbo", yearFrom: 1985, yearTo: 1991 }],
      },
      {
        name: "A610",
        type: "car",
        generations: [{ name: "Série 1", yearFrom: 1991, yearTo: 1995 }],
      },
    ],
  },
  {
    name: "Aston Martin",
    country: "GB",
    models: [
      {
        name: "DB5",
        type: "car",
        generations: [{ name: "DB5", yearFrom: 1963, yearTo: 1965 }],
      },
      {
        name: "DB9",
        type: "car",
        generations: [{ name: "Série 1", yearFrom: 2004, yearTo: 2016 }],
      },
      {
        name: "Vantage",
        type: "car",
        generations: [
          { name: "Série 1", yearFrom: 2005, yearTo: 2017 },
          { name: "Série 2", yearFrom: 2018, yearTo: null },
        ],
      },
    ],
  },
  {
    name: "Audi",
    country: "DE",
    models: [
      {
        name: "A3",
        type: "car",
        generations: [
          { name: "8L", yearFrom: 1996, yearTo: 2003 },
          { name: "8P", yearFrom: 2003, yearTo: 2012 },
          { name: "8V", yearFrom: 2012, yearTo: 2020 },
          { name: "8Y", yearFrom: 2020, yearTo: null },
        ],
      },
      {
        name: "A4",
        type: "car",
        generations: [
          { name: "B5", yearFrom: 1994, yearTo: 2001 },
          { name: "B6", yearFrom: 2000, yearTo: 2004 },
          { name: "B7", yearFrom: 2004, yearTo: 2008 },
          { name: "B8", yearFrom: 2007, yearTo: 2015 },
          { name: "B9", yearFrom: 2015, yearTo: null },
        ],
      },
      {
        name: "TT",
        type: "car",
        generations: [
          { name: "8N", yearFrom: 1998, yearTo: 2006 },
          { name: "8J", yearFrom: 2006, yearTo: 2014 },
          { name: "8S", yearFrom: 2014, yearTo: 2023 },
        ],
      },
      {
        name: "RS3",
        type: "car",
        generations: [
          { name: "8P", yearFrom: 2011, yearTo: 2012 },
          { name: "8V", yearFrom: 2015, yearTo: 2020 },
          { name: "8Y", yearFrom: 2021, yearTo: null },
        ],
      },
      {
        name: "RS6",
        type: "car",
        generations: [
          { name: "C5", yearFrom: 2002, yearTo: 2004 },
          { name: "C6", yearFrom: 2008, yearTo: 2010 },
          { name: "C7", yearFrom: 2013, yearTo: 2018 },
          { name: "C8", yearFrom: 2019, yearTo: null },
        ],
      },
      {
        name: "R8",
        type: "car",
        generations: [
          { name: "Type 42", yearFrom: 2006, yearTo: 2015 },
          { name: "Type 4S", yearFrom: 2015, yearTo: 2023 },
        ],
      },
      {
        name: "Quattro",
        type: "car",
        generations: [{ name: "Ur-Quattro", yearFrom: 1980, yearTo: 1991 }],
      },
      {
        name: "S3",
        type: "car",
        generations: [
          { name: "8L", yearFrom: 1999, yearTo: 2003 },
          { name: "8P", yearFrom: 2006, yearTo: 2012 },
          { name: "8V", yearFrom: 2013, yearTo: 2020 },
          { name: "8Y", yearFrom: 2020, yearTo: null },
        ],
      },
    ],
  },
  {
    name: "BMW",
    country: "DE",
    models: [
      {
        name: "Série 1",
        type: "car",
        generations: [
          { name: "E87", yearFrom: 2004, yearTo: 2013 },
          { name: "F20", yearFrom: 2011, yearTo: 2019 },
          { name: "F40", yearFrom: 2019, yearTo: null },
        ],
      },
      {
        name: "Série 3",
        type: "car",
        generations: [
          { name: "E21", yearFrom: 1975, yearTo: 1983 },
          { name: "E30", yearFrom: 1982, yearTo: 1994 },
          { name: "E36", yearFrom: 1990, yearTo: 2000 },
          { name: "E46", yearFrom: 1998, yearTo: 2006 },
          { name: "E90", yearFrom: 2005, yearTo: 2013 },
          { name: "F30", yearFrom: 2011, yearTo: 2019 },
          { name: "G20", yearFrom: 2018, yearTo: null },
        ],
      },
      {
        name: "M3",
        type: "car",
        generations: [
          { name: "E30", yearFrom: 1986, yearTo: 1991 },
          { name: "E36", yearFrom: 1992, yearTo: 1999 },
          { name: "E46", yearFrom: 2000, yearTo: 2006 },
          { name: "E92", yearFrom: 2007, yearTo: 2013 },
          { name: "F80", yearFrom: 2014, yearTo: 2018 },
          { name: "G80", yearFrom: 2020, yearTo: null },
        ],
      },
      {
        name: "M2",
        type: "car",
        generations: [
          { name: "F87", yearFrom: 2016, yearTo: 2020 },
          { name: "G87", yearFrom: 2022, yearTo: null },
        ],
      },
      {
        name: "M4",
        type: "car",
        generations: [
          { name: "F82", yearFrom: 2014, yearTo: 2020 },
          { name: "G82", yearFrom: 2021, yearTo: null },
        ],
      },
      {
        name: "Série 5",
        type: "car",
        generations: [
          { name: "E28", yearFrom: 1981, yearTo: 1988 },
          { name: "E34", yearFrom: 1988, yearTo: 1996 },
          { name: "E39", yearFrom: 1995, yearTo: 2003 },
          { name: "E60", yearFrom: 2003, yearTo: 2010 },
          { name: "F10", yearFrom: 2010, yearTo: 2017 },
          { name: "G30", yearFrom: 2016, yearTo: 2023 },
        ],
      },
      {
        name: "M5",
        type: "car",
        generations: [
          { name: "E34", yearFrom: 1988, yearTo: 1995 },
          { name: "E39", yearFrom: 1998, yearTo: 2003 },
          { name: "E60", yearFrom: 2005, yearTo: 2010 },
          { name: "F10", yearFrom: 2011, yearTo: 2016 },
          { name: "F90", yearFrom: 2017, yearTo: null },
        ],
      },
      {
        name: "Z3",
        type: "car",
        generations: [{ name: "E36/7", yearFrom: 1995, yearTo: 2002 }],
      },
      {
        name: "Z4",
        type: "car",
        generations: [
          { name: "E85", yearFrom: 2002, yearTo: 2008 },
          { name: "E89", yearFrom: 2009, yearTo: 2016 },
          { name: "G29", yearFrom: 2018, yearTo: null },
        ],
      },
      {
        name: "2002",
        type: "car",
        generations: [{ name: "Série 1", yearFrom: 1966, yearTo: 1977 }],
      },
      {
        name: "R nineT",
        type: "moto",
        generations: [{ name: "Série 1", yearFrom: 2014, yearTo: 2023 }],
      },
      {
        name: "S 1000 RR",
        type: "moto",
        generations: [
          { name: "Gen 1", yearFrom: 2009, yearTo: 2018 },
          { name: "Gen 2", yearFrom: 2019, yearTo: null },
        ],
      },
    ],
  },
  {
    name: "Chevrolet",
    country: "US",
    models: [
      {
        name: "Camaro",
        type: "car",
        generations: [
          { name: "1G", yearFrom: 1967, yearTo: 1969 },
          { name: "2G", yearFrom: 1970, yearTo: 1981 },
          { name: "3G", yearFrom: 1982, yearTo: 1992 },
          { name: "4G", yearFrom: 1993, yearTo: 2002 },
          { name: "5G", yearFrom: 2010, yearTo: 2015 },
          { name: "6G", yearFrom: 2016, yearTo: 2024 },
        ],
      },
      {
        name: "Corvette",
        type: "car",
        generations: [
          { name: "C1", yearFrom: 1953, yearTo: 1962 },
          { name: "C2", yearFrom: 1963, yearTo: 1967 },
          { name: "C3", yearFrom: 1968, yearTo: 1982 },
          { name: "C4", yearFrom: 1984, yearTo: 1996 },
          { name: "C5", yearFrom: 1997, yearTo: 2004 },
          { name: "C6", yearFrom: 2005, yearTo: 2013 },
          { name: "C7", yearFrom: 2014, yearTo: 2019 },
          { name: "C8", yearFrom: 2020, yearTo: null },
        ],
      },
      {
        name: "Bel Air",
        type: "car",
        generations: [{ name: "Tri-Five", yearFrom: 1955, yearTo: 1957 }],
      },
    ],
  },
  {
    name: "Citroën",
    country: "FR",
    models: [
      {
        name: "2CV",
        type: "car",
        generations: [{ name: "2CV", yearFrom: 1948, yearTo: 1990 }],
      },
      {
        name: "DS",
        type: "car",
        generations: [{ name: "DS", yearFrom: 1955, yearTo: 1975 }],
      },
      {
        name: "Méhari",
        type: "car",
        generations: [{ name: "Méhari", yearFrom: 1968, yearTo: 1987 }],
      },
      {
        name: "CX",
        type: "car",
        generations: [
          { name: "Série 1", yearFrom: 1974, yearTo: 1985 },
          { name: "Série 2", yearFrom: 1985, yearTo: 1991 },
        ],
      },
      {
        name: "BX",
        type: "car",
        generations: [
          { name: "Phase 1", yearFrom: 1982, yearTo: 1986 },
          { name: "Phase 2", yearFrom: 1986, yearTo: 1994 },
        ],
      },
      {
        name: "Saxo",
        type: "car",
        generations: [
          { name: "Phase 1", yearFrom: 1996, yearTo: 1999 },
          { name: "Phase 2", yearFrom: 1999, yearTo: 2003 },
        ],
      },
      {
        name: "HY",
        type: "truck",
        generations: [{ name: "HY", yearFrom: 1947, yearTo: 1981 }],
      },
    ],
  },
  {
    name: "Dodge",
    country: "US",
    models: [
      {
        name: "Challenger",
        type: "car",
        generations: [
          { name: "E-body", yearFrom: 1970, yearTo: 1974 },
          { name: "LC", yearFrom: 2008, yearTo: 2023 },
        ],
      },
      {
        name: "Charger",
        type: "car",
        generations: [
          { name: "B-body", yearFrom: 1966, yearTo: 1978 },
          { name: "LX", yearFrom: 2006, yearTo: 2023 },
        ],
      },
      {
        name: "Viper",
        type: "car",
        generations: [
          { name: "Gen 1", yearFrom: 1992, yearTo: 1995 },
          { name: "Gen 2", yearFrom: 1996, yearTo: 2002 },
          { name: "Gen 3", yearFrom: 2003, yearTo: 2006 },
          { name: "Gen 4", yearFrom: 2008, yearTo: 2017 },
        ],
      },
    ],
  },
  {
    name: "Ducati",
    country: "IT",
    models: [
      {
        name: "Monster",
        type: "moto",
        generations: [
          { name: "900", yearFrom: 1993, yearTo: 2001 },
          { name: "S4", yearFrom: 2001, yearTo: 2007 },
          { name: "696", yearFrom: 2008, yearTo: 2014 },
          { name: "821", yearFrom: 2014, yearTo: 2020 },
          { name: "937", yearFrom: 2021, yearTo: null },
        ],
      },
      {
        name: "Panigale",
        type: "moto",
        generations: [
          { name: "1199", yearFrom: 2012, yearTo: 2015 },
          { name: "1299", yearFrom: 2015, yearTo: 2018 },
          { name: "V4", yearFrom: 2018, yearTo: null },
          { name: "V2", yearFrom: 2020, yearTo: null },
        ],
      },
      {
        name: "916",
        type: "moto",
        generations: [
          { name: "916", yearFrom: 1994, yearTo: 1998 },
          { name: "996", yearFrom: 1998, yearTo: 2001 },
          { name: "998", yearFrom: 2002, yearTo: 2004 },
        ],
      },
    ],
  },
  {
    name: "Ferrari",
    country: "IT",
    models: [
      {
        name: "Dino 246",
        type: "car",
        generations: [{ name: "GT/GTS", yearFrom: 1969, yearTo: 1974 }],
      },
      {
        name: "308",
        type: "car",
        generations: [{ name: "GTB/GTS", yearFrom: 1975, yearTo: 1985 }],
      },
      {
        name: "328",
        type: "car",
        generations: [{ name: "GTB/GTS", yearFrom: 1985, yearTo: 1989 }],
      },
      {
        name: "348",
        type: "car",
        generations: [{ name: "tb/ts", yearFrom: 1989, yearTo: 1995 }],
      },
      {
        name: "F355",
        type: "car",
        generations: [{ name: "Berlinetta", yearFrom: 1994, yearTo: 1999 }],
      },
      {
        name: "360",
        type: "car",
        generations: [{ name: "Modena", yearFrom: 1999, yearTo: 2005 }],
      },
      {
        name: "F430",
        type: "car",
        generations: [{ name: "F430", yearFrom: 2004, yearTo: 2009 }],
      },
      {
        name: "458",
        type: "car",
        generations: [{ name: "Italia", yearFrom: 2009, yearTo: 2015 }],
      },
      {
        name: "488",
        type: "car",
        generations: [{ name: "GTB", yearFrom: 2015, yearTo: 2019 }],
      },
      {
        name: "F40",
        type: "car",
        generations: [{ name: "F40", yearFrom: 1987, yearTo: 1992 }],
      },
      {
        name: "Testarossa",
        type: "car",
        generations: [{ name: "Testarossa", yearFrom: 1984, yearTo: 1991 }],
      },
    ],
  },
  {
    name: "Fiat",
    country: "IT",
    models: [
      {
        name: "500",
        type: "car",
        generations: [
          { name: "Nuova 500", yearFrom: 1957, yearTo: 1975 },
          { name: "Moderne", yearFrom: 2007, yearTo: null },
        ],
      },
      {
        name: "Panda",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1980, yearTo: 2003 },
          { name: "Mk2", yearFrom: 2003, yearTo: 2012 },
          { name: "Mk3", yearFrom: 2011, yearTo: null },
        ],
      },
      {
        name: "Uno",
        type: "car",
        generations: [
          { name: "Phase 1", yearFrom: 1983, yearTo: 1989 },
          { name: "Phase 2", yearFrom: 1989, yearTo: 1995 },
        ],
      },
      {
        name: "Punto",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1993, yearTo: 1999 },
          { name: "Mk2", yearFrom: 1999, yearTo: 2005 },
          { name: "Grande Punto", yearFrom: 2005, yearTo: 2009 },
        ],
      },
      {
        name: "X1/9",
        type: "car",
        generations: [{ name: "X1/9", yearFrom: 1972, yearTo: 1989 }],
      },
      {
        name: "Barchetta",
        type: "car",
        generations: [{ name: "Barchetta", yearFrom: 1995, yearTo: 2005 }],
      },
      {
        name: "124 Spider",
        type: "car",
        generations: [
          { name: "Série 1", yearFrom: 1966, yearTo: 1985 },
          { name: "Série 2", yearFrom: 2016, yearTo: 2019 },
        ],
      },
    ],
  },
  {
    name: "Ford",
    country: "US",
    models: [
      {
        name: "Fiesta",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1976, yearTo: 1983 },
          { name: "Mk2", yearFrom: 1983, yearTo: 1989 },
          { name: "Mk3", yearFrom: 1989, yearTo: 1995 },
          { name: "Mk4", yearFrom: 1995, yearTo: 2002 },
          { name: "Mk5", yearFrom: 2001, yearTo: 2008 },
          { name: "Mk6", yearFrom: 2008, yearTo: 2017 },
          { name: "Mk7", yearFrom: 2017, yearTo: 2023 },
        ],
      },
      {
        name: "Focus",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1998, yearTo: 2004 },
          { name: "Mk2", yearFrom: 2004, yearTo: 2011 },
          { name: "Mk3", yearFrom: 2010, yearTo: 2018 },
          { name: "Mk4", yearFrom: 2018, yearTo: 2025 },
        ],
      },
      {
        name: "Escort",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1968, yearTo: 1974 },
          { name: "Mk2", yearFrom: 1975, yearTo: 1980 },
          { name: "Mk3", yearFrom: 1980, yearTo: 1986 },
          { name: "Mk4", yearFrom: 1986, yearTo: 1990 },
          { name: "Mk5", yearFrom: 1990, yearTo: 1995 },
          { name: "Mk6", yearFrom: 1995, yearTo: 2000 },
        ],
      },
      {
        name: "Sierra",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1982, yearTo: 1987 },
          { name: "Mk2", yearFrom: 1987, yearTo: 1993 },
        ],
      },
      {
        name: "Mustang",
        type: "car",
        generations: [
          { name: "Première génération", yearFrom: 1964, yearTo: 1973 },
          { name: "Mustang II", yearFrom: 1974, yearTo: 1978 },
          { name: "Fox", yearFrom: 1979, yearTo: 1993 },
          { name: "SN95", yearFrom: 1994, yearTo: 2004 },
          { name: "S197", yearFrom: 2005, yearTo: 2014 },
          { name: "S550", yearFrom: 2015, yearTo: 2023 },
          { name: "S650", yearFrom: 2024, yearTo: null },
        ],
      },
      {
        name: "Capri",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1969, yearTo: 1974 },
          { name: "Mk2", yearFrom: 1974, yearTo: 1977 },
          { name: "Mk3", yearFrom: 1978, yearTo: 1986 },
        ],
      },
      {
        name: "GT40",
        type: "car",
        generations: [{ name: "GT40", yearFrom: 1964, yearTo: 1969 }],
      },
    ],
  },
  {
    name: "Honda",
    country: "JP",
    models: [
      {
        name: "Civic",
        type: "car",
        generations: [
          { name: "EF", yearFrom: 1987, yearTo: 1991 },
          { name: "EG", yearFrom: 1991, yearTo: 1995 },
          { name: "EK", yearFrom: 1995, yearTo: 2000 },
          { name: "EP", yearFrom: 2001, yearTo: 2005 },
          { name: "FN", yearFrom: 2006, yearTo: 2011 },
          { name: "FK", yearFrom: 2012, yearTo: 2016 },
          { name: "FK7", yearFrom: 2017, yearTo: 2021 },
          { name: "FL", yearFrom: 2022, yearTo: null },
        ],
      },
      {
        name: "S2000",
        type: "car",
        generations: [
          { name: "AP1", yearFrom: 1999, yearTo: 2003 },
          { name: "AP2", yearFrom: 2004, yearTo: 2009 },
        ],
      },
      {
        name: "Integra",
        type: "car",
        generations: [
          { name: "DC2", yearFrom: 1993, yearTo: 2001 },
          { name: "DC5", yearFrom: 2001, yearTo: 2006 },
        ],
      },
      {
        name: "NSX",
        type: "car",
        generations: [
          { name: "NA", yearFrom: 1990, yearTo: 2005 },
          { name: "NC1", yearFrom: 2016, yearTo: 2022 },
        ],
      },
      {
        name: "CRX",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1983, yearTo: 1987 },
          { name: "Mk2", yearFrom: 1987, yearTo: 1991 },
        ],
      },
      {
        name: "Prelude",
        type: "car",
        generations: [
          { name: "BA", yearFrom: 1987, yearTo: 1991 },
          { name: "BB1", yearFrom: 1991, yearTo: 1996 },
          { name: "BB6", yearFrom: 1996, yearTo: 2001 },
        ],
      },
      {
        name: "CBR 600 RR",
        type: "moto",
        generations: [
          { name: "PC37", yearFrom: 2003, yearTo: 2006 },
          { name: "PC40", yearFrom: 2007, yearTo: 2016 },
        ],
      },
      {
        name: "CBR 1000 RR",
        type: "moto",
        generations: [
          { name: "SC57", yearFrom: 2004, yearTo: 2007 },
          { name: "SC59", yearFrom: 2008, yearTo: 2016 },
          { name: "SC77", yearFrom: 2017, yearTo: 2019 },
          { name: "SC82", yearFrom: 2020, yearTo: null },
        ],
      },
      {
        name: "CB 750",
        type: "moto",
        generations: [
          { name: "Four", yearFrom: 1969, yearTo: 1978 },
          { name: "Seven Fifty", yearFrom: 1992, yearTo: 2003 },
        ],
      },
    ],
  },
  {
    name: "Hyundai",
    country: "KR",
    models: [
      {
        name: "Coupé",
        type: "car",
        generations: [
          { name: "RD", yearFrom: 1996, yearTo: 2002 },
          { name: "GK", yearFrom: 2002, yearTo: 2009 },
        ],
      },
      {
        name: "Veloster",
        type: "car",
        generations: [
          { name: "FS", yearFrom: 2011, yearTo: 2017 },
          { name: "JS", yearFrom: 2018, yearTo: 2021 },
        ],
      },
      {
        name: "i30 N",
        type: "car",
        generations: [{ name: "PD", yearFrom: 2017, yearTo: null }],
      },
    ],
  },
  {
    name: "Jaguar",
    country: "GB",
    models: [
      {
        name: "E-Type",
        type: "car",
        generations: [
          { name: "Série 1", yearFrom: 1961, yearTo: 1968 },
          { name: "Série 2", yearFrom: 1968, yearTo: 1971 },
          { name: "Série 3", yearFrom: 1971, yearTo: 1975 },
        ],
      },
      {
        name: "XJ",
        type: "car",
        generations: [
          { name: "Série 1", yearFrom: 1968, yearTo: 1973 },
          { name: "Série 2", yearFrom: 1973, yearTo: 1979 },
          { name: "Série 3", yearFrom: 1979, yearTo: 1992 },
          { name: "XJ40", yearFrom: 1986, yearTo: 1994 },
          { name: "X300", yearFrom: 1994, yearTo: 1997 },
          { name: "X308", yearFrom: 1997, yearTo: 2003 },
          { name: "X350", yearFrom: 2003, yearTo: 2009 },
          { name: "X351", yearFrom: 2009, yearTo: 2019 },
        ],
      },
      {
        name: "XJS",
        type: "car",
        generations: [{ name: "XJS", yearFrom: 1975, yearTo: 1996 }],
      },
      {
        name: "XK8",
        type: "car",
        generations: [{ name: "X100", yearFrom: 1996, yearTo: 2006 }],
      },
      {
        name: "F-Type",
        type: "car",
        generations: [{ name: "X152", yearFrom: 2013, yearTo: 2024 }],
      },
    ],
  },
  {
    name: "Jeep",
    country: "US",
    models: [
      {
        name: "Wrangler",
        type: "car",
        generations: [
          { name: "YJ", yearFrom: 1987, yearTo: 1995 },
          { name: "TJ", yearFrom: 1996, yearTo: 2006 },
          { name: "JK", yearFrom: 2007, yearTo: 2018 },
          { name: "JL", yearFrom: 2018, yearTo: null },
        ],
      },
      {
        name: "Cherokee",
        type: "car",
        generations: [{ name: "XJ", yearFrom: 1984, yearTo: 2001 }],
      },
      {
        name: "CJ",
        type: "car",
        generations: [
          { name: "CJ-5", yearFrom: 1955, yearTo: 1983 },
          { name: "CJ-7", yearFrom: 1976, yearTo: 1986 },
        ],
      },
    ],
  },
  {
    name: "Kawasaki",
    country: "JP",
    models: [
      {
        name: "Z900",
        type: "moto",
        generations: [
          { name: "Z1", yearFrom: 1973, yearTo: 1976 },
          { name: "Z900 (2017)", yearFrom: 2017, yearTo: null },
        ],
      },
      {
        name: "Z1000",
        type: "moto",
        generations: [
          { name: "2003", yearFrom: 2003, yearTo: 2006 },
          { name: "2007", yearFrom: 2007, yearTo: 2009 },
          { name: "2010", yearFrom: 2010, yearTo: 2013 },
          { name: "2014", yearFrom: 2014, yearTo: 2020 },
        ],
      },
      {
        name: "ZX-10R",
        type: "moto",
        generations: [
          { name: "2004", yearFrom: 2004, yearTo: 2005 },
          { name: "2006", yearFrom: 2006, yearTo: 2007 },
          { name: "2008", yearFrom: 2008, yearTo: 2010 },
          { name: "2011", yearFrom: 2011, yearTo: 2015 },
          { name: "2016", yearFrom: 2016, yearTo: 2020 },
          { name: "2021", yearFrom: 2021, yearTo: null },
        ],
      },
    ],
  },
  {
    name: "Kia",
    country: "KR",
    models: [
      {
        name: "Ceed",
        type: "car",
        generations: [
          { name: "ED", yearFrom: 2006, yearTo: 2012 },
          { name: "JD", yearFrom: 2012, yearTo: 2018 },
          { name: "CD", yearFrom: 2018, yearTo: null },
        ],
      },
      {
        name: "Stinger",
        type: "car",
        generations: [{ name: "CK", yearFrom: 2017, yearTo: 2023 }],
      },
    ],
  },
  {
    name: "Lamborghini",
    country: "IT",
    models: [
      {
        name: "Miura",
        type: "car",
        generations: [{ name: "Miura", yearFrom: 1966, yearTo: 1973 }],
      },
      {
        name: "Countach",
        type: "car",
        generations: [
          { name: "LP400", yearFrom: 1974, yearTo: 1978 },
          { name: "LP400 S", yearFrom: 1978, yearTo: 1982 },
          { name: "LP500 S", yearFrom: 1982, yearTo: 1985 },
          { name: "5000 QV", yearFrom: 1985, yearTo: 1988 },
          { name: "25th Anniversary", yearFrom: 1988, yearTo: 1990 },
        ],
      },
      {
        name: "Diablo",
        type: "car",
        generations: [{ name: "Série 1", yearFrom: 1990, yearTo: 2001 }],
      },
      {
        name: "Murciélago",
        type: "car",
        generations: [{ name: "Série 1", yearFrom: 2001, yearTo: 2010 }],
      },
      {
        name: "Gallardo",
        type: "car",
        generations: [{ name: "Série 1", yearFrom: 2003, yearTo: 2013 }],
      },
      {
        name: "Aventador",
        type: "car",
        generations: [{ name: "LP700", yearFrom: 2011, yearTo: 2022 }],
      },
      {
        name: "Huracán",
        type: "car",
        generations: [{ name: "LP610", yearFrom: 2014, yearTo: 2024 }],
      },
    ],
  },
  {
    name: "Lancia",
    country: "IT",
    models: [
      {
        name: "Delta",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1979, yearTo: 1994 },
          { name: "Mk2", yearFrom: 1993, yearTo: 1999 },
          { name: "Mk3", yearFrom: 2008, yearTo: 2014 },
        ],
      },
      {
        name: "Stratos",
        type: "car",
        generations: [{ name: "Stratos", yearFrom: 1973, yearTo: 1978 }],
      },
      {
        name: "037",
        type: "car",
        generations: [{ name: "Rally 037", yearFrom: 1982, yearTo: 1983 }],
      },
      {
        name: "Fulvia",
        type: "car",
        generations: [
          { name: "Berlina", yearFrom: 1963, yearTo: 1972 },
          { name: "Coupé", yearFrom: 1965, yearTo: 1976 },
        ],
      },
      {
        name: "Thema",
        type: "car",
        generations: [
          { name: "Série 1", yearFrom: 1984, yearTo: 1988 },
          { name: "Série 2", yearFrom: 1988, yearTo: 1994 },
        ],
      },
    ],
  },
  {
    name: "Land Rover",
    country: "GB",
    models: [
      {
        name: "Defender",
        type: "car",
        generations: [
          { name: "90/110", yearFrom: 1983, yearTo: 1990 },
          { name: "Defender", yearFrom: 1990, yearTo: 2016 },
          { name: "L663", yearFrom: 2020, yearTo: null },
        ],
      },
      {
        name: "Série",
        type: "car",
        generations: [
          { name: "Série I", yearFrom: 1948, yearTo: 1958 },
          { name: "Série II", yearFrom: 1958, yearTo: 1961 },
          { name: "Série IIA", yearFrom: 1961, yearTo: 1971 },
          { name: "Série III", yearFrom: 1971, yearTo: 1985 },
        ],
      },
      {
        name: "Discovery",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1989, yearTo: 1998 },
          { name: "Mk2", yearFrom: 1998, yearTo: 2004 },
          { name: "Mk3", yearFrom: 2004, yearTo: 2009 },
          { name: "Mk4", yearFrom: 2009, yearTo: 2016 },
          { name: "Mk5", yearFrom: 2017, yearTo: null },
        ],
      },
      {
        name: "Range Rover",
        type: "car",
        generations: [
          { name: "Classic", yearFrom: 1970, yearTo: 1996 },
          { name: "P38A", yearFrom: 1994, yearTo: 2002 },
          { name: "L322", yearFrom: 2002, yearTo: 2012 },
          { name: "L405", yearFrom: 2012, yearTo: 2021 },
          { name: "L460", yearFrom: 2022, yearTo: null },
        ],
      },
    ],
  },
  {
    name: "Lotus",
    country: "GB",
    models: [
      {
        name: "Elise",
        type: "car",
        generations: [
          { name: "S1", yearFrom: 1996, yearTo: 2000 },
          { name: "S2", yearFrom: 2000, yearTo: 2011 },
          { name: "S3", yearFrom: 2011, yearTo: 2021 },
        ],
      },
      {
        name: "Exige",
        type: "car",
        generations: [
          { name: "S1", yearFrom: 2000, yearTo: 2001 },
          { name: "S2", yearFrom: 2004, yearTo: 2011 },
          { name: "S3", yearFrom: 2012, yearTo: 2021 },
        ],
      },
      {
        name: "Esprit",
        type: "car",
        generations: [
          { name: "S1", yearFrom: 1976, yearTo: 1978 },
          { name: "S2", yearFrom: 1978, yearTo: 1981 },
          { name: "S3", yearFrom: 1981, yearTo: 1987 },
          { name: "X180", yearFrom: 1987, yearTo: 1993 },
          { name: "S4", yearFrom: 1993, yearTo: 1996 },
          { name: "V8", yearFrom: 1996, yearTo: 2004 },
        ],
      },
      {
        name: "Seven",
        type: "car",
        generations: [
          { name: "S1", yearFrom: 1957, yearTo: 1960 },
          { name: "S2", yearFrom: 1960, yearTo: 1968 },
          { name: "S3", yearFrom: 1968, yearTo: 1970 },
          { name: "S4", yearFrom: 1970, yearTo: 1973 },
        ],
      },
    ],
  },
  {
    name: "Maserati",
    country: "IT",
    models: [
      {
        name: "Ghibli",
        type: "car",
        generations: [
          { name: "AM115", yearFrom: 1967, yearTo: 1973 },
          { name: "Ghibli II", yearFrom: 1992, yearTo: 1998 },
          { name: "M157", yearFrom: 2013, yearTo: 2024 },
        ],
      },
      {
        name: "Quattroporte",
        type: "car",
        generations: [
          { name: "Quattroporte I", yearFrom: 1963, yearTo: 1969 },
          { name: "Quattroporte III", yearFrom: 1979, yearTo: 1990 },
          { name: "Quattroporte IV", yearFrom: 1994, yearTo: 2001 },
          { name: "Quattroporte V", yearFrom: 2003, yearTo: 2012 },
          { name: "Quattroporte VI", yearFrom: 2013, yearTo: 2024 },
        ],
      },
      {
        name: "GranTurismo",
        type: "car",
        generations: [
          { name: "M145", yearFrom: 2007, yearTo: 2019 },
          { name: "M189", yearFrom: 2022, yearTo: null },
        ],
      },
      {
        name: "Biturbo",
        type: "car",
        generations: [{ name: "Biturbo", yearFrom: 1981, yearTo: 1994 }],
      },
    ],
  },
  {
    name: "Mazda",
    country: "JP",
    models: [
      {
        name: "MX-5",
        type: "car",
        generations: [
          { name: "NA", yearFrom: 1989, yearTo: 1997 },
          { name: "NB", yearFrom: 1998, yearTo: 2005 },
          { name: "NC", yearFrom: 2005, yearTo: 2015 },
          { name: "ND", yearFrom: 2015, yearTo: null },
        ],
      },
      {
        name: "RX-7",
        type: "car",
        generations: [
          { name: "FB", yearFrom: 1978, yearTo: 1985 },
          { name: "FC", yearFrom: 1985, yearTo: 1992 },
          { name: "FD", yearFrom: 1992, yearTo: 2002 },
        ],
      },
      {
        name: "RX-8",
        type: "car",
        generations: [{ name: "SE", yearFrom: 2003, yearTo: 2012 }],
      },
      {
        name: "323",
        type: "car",
        generations: [
          { name: "BF", yearFrom: 1985, yearTo: 1989 },
          { name: "BG", yearFrom: 1989, yearTo: 1994 },
        ],
      },
      {
        name: "3",
        type: "car",
        generations: [
          { name: "BK", yearFrom: 2003, yearTo: 2009 },
          { name: "BL", yearFrom: 2009, yearTo: 2013 },
          { name: "BM", yearFrom: 2013, yearTo: 2019 },
          { name: "BP", yearFrom: 2019, yearTo: null },
        ],
      },
    ],
  },
  {
    name: "McLaren",
    country: "GB",
    models: [
      {
        name: "F1",
        type: "car",
        generations: [{ name: "F1", yearFrom: 1992, yearTo: 1998 }],
      },
      {
        name: "570S",
        type: "car",
        generations: [{ name: "570S", yearFrom: 2015, yearTo: 2021 }],
      },
      {
        name: "720S",
        type: "car",
        generations: [{ name: "720S", yearFrom: 2017, yearTo: 2023 }],
      },
    ],
  },
  {
    name: "Mercedes-Benz",
    country: "DE",
    models: [
      {
        name: "Classe A",
        type: "car",
        generations: [
          { name: "W168", yearFrom: 1997, yearTo: 2004 },
          { name: "W169", yearFrom: 2004, yearTo: 2012 },
          { name: "W176", yearFrom: 2012, yearTo: 2018 },
          { name: "W177", yearFrom: 2018, yearTo: null },
        ],
      },
      {
        name: "Classe C",
        type: "car",
        generations: [
          { name: "W202", yearFrom: 1993, yearTo: 2000 },
          { name: "W203", yearFrom: 2000, yearTo: 2007 },
          { name: "W204", yearFrom: 2007, yearTo: 2014 },
          { name: "W205", yearFrom: 2014, yearTo: 2021 },
          { name: "W206", yearFrom: 2021, yearTo: null },
        ],
      },
      {
        name: "Classe E",
        type: "car",
        generations: [
          { name: "W123", yearFrom: 1976, yearTo: 1985 },
          { name: "W124", yearFrom: 1984, yearTo: 1997 },
          { name: "W210", yearFrom: 1995, yearTo: 2003 },
          { name: "W211", yearFrom: 2002, yearTo: 2009 },
          { name: "W212", yearFrom: 2009, yearTo: 2016 },
          { name: "W213", yearFrom: 2016, yearTo: 2023 },
        ],
      },
      {
        name: "Classe S",
        type: "car",
        generations: [
          { name: "W116", yearFrom: 1972, yearTo: 1980 },
          { name: "W126", yearFrom: 1979, yearTo: 1991 },
          { name: "W140", yearFrom: 1991, yearTo: 1998 },
          { name: "W220", yearFrom: 1998, yearTo: 2005 },
          { name: "W221", yearFrom: 2005, yearTo: 2013 },
          { name: "W222", yearFrom: 2013, yearTo: 2020 },
        ],
      },
      {
        name: "190",
        type: "car",
        generations: [{ name: "W201", yearFrom: 1982, yearTo: 1993 }],
      },
      {
        name: "SL",
        type: "car",
        generations: [
          { name: "W113", yearFrom: 1963, yearTo: 1971 },
          { name: "R107", yearFrom: 1971, yearTo: 1989 },
          { name: "R129", yearFrom: 1989, yearTo: 2001 },
          { name: "R230", yearFrom: 2001, yearTo: 2011 },
          { name: "R231", yearFrom: 2012, yearTo: 2020 },
          { name: "R232", yearFrom: 2022, yearTo: null },
        ],
      },
      {
        name: "300 SL",
        type: "car",
        generations: [{ name: "W198", yearFrom: 1954, yearTo: 1963 }],
      },
      {
        name: "AMG GT",
        type: "car",
        generations: [{ name: "C190", yearFrom: 2014, yearTo: 2021 }],
      },
      {
        name: "Classe G",
        type: "car",
        generations: [
          { name: "W460", yearFrom: 1979, yearTo: 1992 },
          { name: "W463", yearFrom: 1989, yearTo: 2018 },
          { name: "W463A", yearFrom: 2018, yearTo: null },
        ],
      },
    ],
  },
  {
    name: "MG",
    country: "GB",
    models: [
      {
        name: "MGB",
        type: "car",
        generations: [
          { name: "Chrome Bumper", yearFrom: 1962, yearTo: 1974 },
          { name: "Rubber Bumper", yearFrom: 1974, yearTo: 1980 },
        ],
      },
      {
        name: "Midget",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1961, yearTo: 1964 },
          { name: "Mk2", yearFrom: 1964, yearTo: 1966 },
          { name: "Mk3", yearFrom: 1966, yearTo: 1974 },
          { name: "1500", yearFrom: 1974, yearTo: 1979 },
        ],
      },
      {
        name: "MGF",
        type: "car",
        generations: [{ name: "MGF", yearFrom: 1995, yearTo: 2002 }],
      },
    ],
  },
  {
    name: "Mini",
    country: "GB",
    models: [
      {
        name: "Mini Classic",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1959, yearTo: 1967 },
          { name: "Mk2", yearFrom: 1967, yearTo: 1970 },
          { name: "Mk3", yearFrom: 1969, yearTo: 1976 },
          { name: "Mk4", yearFrom: 1976, yearTo: 1984 },
          { name: "Mk5", yearFrom: 1984, yearTo: 1992 },
        ],
      },
      {
        name: "Cooper S",
        type: "car",
        generations: [
          { name: "R53", yearFrom: 2002, yearTo: 2006 },
          { name: "R56", yearFrom: 2006, yearTo: 2013 },
          { name: "F56", yearFrom: 2014, yearTo: null },
        ],
      },
      {
        name: "John Cooper Works",
        type: "car",
        generations: [
          { name: "R56", yearFrom: 2008, yearTo: 2013 },
          { name: "F56", yearFrom: 2015, yearTo: null },
        ],
      },
    ],
  },
  {
    name: "Mitsubishi",
    country: "JP",
    models: [
      {
        name: "Lancer Evolution",
        type: "car",
        generations: [
          { name: "Evo I", yearFrom: 1992, yearTo: 1993 },
          { name: "Evo II", yearFrom: 1994, yearTo: 1995 },
          { name: "Evo III", yearFrom: 1995, yearTo: 1996 },
          { name: "Evo IV", yearFrom: 1996, yearTo: 1998 },
          { name: "Evo V", yearFrom: 1998, yearTo: 1999 },
          { name: "Evo VI", yearFrom: 1999, yearTo: 2001 },
          { name: "Evo VII", yearFrom: 2001, yearTo: 2003 },
          { name: "Evo VIII", yearFrom: 2003, yearTo: 2005 },
          { name: "Evo IX", yearFrom: 2005, yearTo: 2007 },
          { name: "Evo X", yearFrom: 2007, yearTo: 2016 },
        ],
      },
      {
        name: "3000GT",
        type: "car",
        generations: [
          { name: "Z15A", yearFrom: 1990, yearTo: 1993 },
          { name: "Z16A", yearFrom: 1994, yearTo: 2000 },
        ],
      },
      {
        name: "Eclipse",
        type: "car",
        generations: [
          { name: "1G", yearFrom: 1989, yearTo: 1994 },
          { name: "2G", yearFrom: 1995, yearTo: 1999 },
          { name: "3G", yearFrom: 2000, yearTo: 2005 },
          { name: "4G", yearFrom: 2006, yearTo: 2012 },
        ],
      },
      {
        name: "Pajero",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1982, yearTo: 1991 },
          { name: "Mk2", yearFrom: 1991, yearTo: 1999 },
          { name: "Mk3", yearFrom: 1999, yearTo: 2006 },
          { name: "Mk4", yearFrom: 2006, yearTo: 2021 },
        ],
      },
    ],
  },
  {
    name: "Nissan",
    country: "JP",
    models: [
      {
        name: "200SX",
        type: "car",
        generations: [
          { name: "S13", yearFrom: 1989, yearTo: 1993 },
          { name: "S14", yearFrom: 1994, yearTo: 1998 },
          { name: "S15", yearFrom: 1999, yearTo: 2002 },
        ],
      },
      {
        name: "Silvia",
        type: "car",
        generations: [
          { name: "S13", yearFrom: 1988, yearTo: 1993 },
          { name: "S14", yearFrom: 1993, yearTo: 1998 },
          { name: "S15", yearFrom: 1999, yearTo: 2002 },
        ],
      },
      {
        name: "Skyline GT-R",
        type: "car",
        generations: [
          { name: "R32", yearFrom: 1989, yearTo: 1994 },
          { name: "R33", yearFrom: 1995, yearTo: 1998 },
          { name: "R34", yearFrom: 1999, yearTo: 2002 },
        ],
      },
      {
        name: "GT-R",
        type: "car",
        generations: [{ name: "R35", yearFrom: 2007, yearTo: 2024 }],
      },
      {
        name: "Z",
        type: "car",
        generations: [
          { name: "S30", yearFrom: 1969, yearTo: 1978 },
          { name: "S130", yearFrom: 1978, yearTo: 1983 },
          { name: "Z31", yearFrom: 1983, yearTo: 1989 },
          { name: "Z32", yearFrom: 1989, yearTo: 2000 },
          { name: "Z33", yearFrom: 2002, yearTo: 2009 },
          { name: "Z34", yearFrom: 2008, yearTo: 2020 },
          { name: "RZ34", yearFrom: 2022, yearTo: null },
        ],
      },
    ],
  },
  {
    name: "Opel",
    country: "DE",
    models: [
      {
        name: "Corsa",
        type: "car",
        generations: [
          { name: "A", yearFrom: 1982, yearTo: 1993 },
          { name: "B", yearFrom: 1993, yearTo: 2000 },
          { name: "C", yearFrom: 2000, yearTo: 2006 },
          { name: "D", yearFrom: 2006, yearTo: 2014 },
          { name: "E", yearFrom: 2014, yearTo: 2019 },
          { name: "F", yearFrom: 2019, yearTo: null },
        ],
      },
      {
        name: "Astra",
        type: "car",
        generations: [
          { name: "F", yearFrom: 1991, yearTo: 1998 },
          { name: "G", yearFrom: 1998, yearTo: 2004 },
          { name: "H", yearFrom: 2004, yearTo: 2010 },
          { name: "J", yearFrom: 2009, yearTo: 2015 },
          { name: "K", yearFrom: 2015, yearTo: 2021 },
          { name: "L", yearFrom: 2021, yearTo: null },
        ],
      },
      {
        name: "Kadett",
        type: "car",
        generations: [
          { name: "C", yearFrom: 1973, yearTo: 1979 },
          { name: "D", yearFrom: 1979, yearTo: 1984 },
          { name: "E", yearFrom: 1984, yearTo: 1991 },
        ],
      },
      {
        name: "Manta",
        type: "car",
        generations: [
          { name: "A", yearFrom: 1970, yearTo: 1975 },
          { name: "B", yearFrom: 1975, yearTo: 1988 },
        ],
      },
      {
        name: "Calibra",
        type: "car",
        generations: [{ name: "Calibra", yearFrom: 1990, yearTo: 1997 }],
      },
    ],
  },
  {
    name: "Peugeot",
    country: "FR",
    models: [
      {
        name: "504",
        type: "car",
        generations: [
          { name: "Berline", yearFrom: 1968, yearTo: 1983 },
          { name: "Coupé", yearFrom: 1969, yearTo: 1983 },
          { name: "Cabriolet", yearFrom: 1969, yearTo: 1983 },
        ],
      },
      {
        name: "205",
        type: "car",
        generations: [
          { name: "Phase 1", yearFrom: 1983, yearTo: 1987 },
          { name: "Phase 2", yearFrom: 1987, yearTo: 1998 },
          { name: "GTI", yearFrom: 1984, yearTo: 1994 },
          { name: "Rallye", yearFrom: 1988, yearTo: 1992 },
        ],
      },
      {
        name: "106",
        type: "car",
        generations: [
          { name: "Phase 1", yearFrom: 1991, yearTo: 1996 },
          { name: "Phase 2", yearFrom: 1996, yearTo: 2003 },
          { name: "Rallye", yearFrom: 1994, yearTo: 2003 },
          { name: "S16", yearFrom: 1993, yearTo: 2003 },
        ],
      },
      {
        name: "206",
        type: "car",
        generations: [
          { name: "Phase 1", yearFrom: 1998, yearTo: 2003 },
          { name: "Phase 2", yearFrom: 2003, yearTo: 2009 },
          { name: "RC", yearFrom: 2003, yearTo: 2007 },
        ],
      },
      {
        name: "306",
        type: "car",
        generations: [
          { name: "Phase 1", yearFrom: 1993, yearTo: 1997 },
          { name: "Phase 2", yearFrom: 1997, yearTo: 2000 },
          { name: "Phase 3", yearFrom: 2000, yearTo: 2002 },
          { name: "Rallye", yearFrom: 1998, yearTo: 2000 },
        ],
      },
      {
        name: "309",
        type: "car",
        generations: [
          { name: "Phase 1", yearFrom: 1985, yearTo: 1989 },
          { name: "Phase 2", yearFrom: 1989, yearTo: 1993 },
          { name: "GTI", yearFrom: 1987, yearTo: 1993 },
        ],
      },
      {
        name: "405",
        type: "car",
        generations: [
          { name: "Phase 1", yearFrom: 1987, yearTo: 1992 },
          { name: "Phase 2", yearFrom: 1992, yearTo: 1996 },
          { name: "Mi16", yearFrom: 1988, yearTo: 1992 },
        ],
      },
      {
        name: "208",
        type: "car",
        generations: [
          { name: "Phase 1", yearFrom: 2012, yearTo: 2015 },
          { name: "Phase 2", yearFrom: 2015, yearTo: 2019 },
          { name: "II", yearFrom: 2019, yearTo: null },
        ],
      },
      {
        name: "RCZ",
        type: "car",
        generations: [
          { name: "Phase 1", yearFrom: 2010, yearTo: 2013 },
          { name: "Phase 2", yearFrom: 2013, yearTo: 2015 },
        ],
      },
    ],
  },
  {
    name: "Pontiac",
    country: "US",
    models: [
      {
        name: "Firebird",
        type: "car",
        generations: [
          { name: "Première génération", yearFrom: 1967, yearTo: 1969 },
          { name: "Seconde génération", yearFrom: 1970, yearTo: 1981 },
          { name: "Troisième génération", yearFrom: 1982, yearTo: 1992 },
          { name: "Quatrième génération", yearFrom: 1993, yearTo: 2002 },
        ],
      },
      {
        name: "GTO",
        type: "car",
        generations: [
          { name: "Première génération", yearFrom: 1964, yearTo: 1974 },
          { name: "2004", yearFrom: 2004, yearTo: 2006 },
        ],
      },
    ],
  },
  {
    name: "Porsche",
    country: "DE",
    models: [
      {
        name: "356",
        type: "car",
        generations: [{ name: "356", yearFrom: 1948, yearTo: 1965 }],
      },
      {
        name: "911",
        type: "car",
        generations: [
          { name: "Classique", yearFrom: 1964, yearTo: 1973 },
          { name: "G", yearFrom: 1974, yearTo: 1989 },
          { name: "964", yearFrom: 1989, yearTo: 1994 },
          { name: "993", yearFrom: 1993, yearTo: 1998 },
          { name: "996", yearFrom: 1997, yearTo: 2005 },
          { name: "997", yearFrom: 2004, yearTo: 2012 },
          { name: "991", yearFrom: 2011, yearTo: 2019 },
          { name: "992", yearFrom: 2018, yearTo: null },
        ],
      },
      {
        name: "914",
        type: "car",
        generations: [{ name: "914", yearFrom: 1969, yearTo: 1976 }],
      },
      {
        name: "924",
        type: "car",
        generations: [{ name: "924", yearFrom: 1976, yearTo: 1988 }],
      },
      {
        name: "928",
        type: "car",
        generations: [{ name: "928", yearFrom: 1977, yearTo: 1995 }],
      },
      {
        name: "944",
        type: "car",
        generations: [
          { name: "944", yearFrom: 1982, yearTo: 1991 },
          { name: "Turbo", yearFrom: 1985, yearTo: 1991 },
          { name: "S2", yearFrom: 1989, yearTo: 1991 },
        ],
      },
      {
        name: "968",
        type: "car",
        generations: [{ name: "968", yearFrom: 1991, yearTo: 1995 }],
      },
      {
        name: "Boxster",
        type: "car",
        generations: [
          { name: "986", yearFrom: 1996, yearTo: 2004 },
          { name: "987", yearFrom: 2004, yearTo: 2012 },
          { name: "981", yearFrom: 2012, yearTo: 2016 },
          { name: "718", yearFrom: 2016, yearTo: null },
        ],
      },
      {
        name: "Cayman",
        type: "car",
        generations: [
          { name: "987c", yearFrom: 2005, yearTo: 2012 },
          { name: "981c", yearFrom: 2013, yearTo: 2016 },
          { name: "718", yearFrom: 2016, yearTo: null },
        ],
      },
    ],
  },
  {
    name: "Renault",
    country: "FR",
    models: [
      {
        name: "4L",
        type: "car",
        generations: [{ name: "4L", yearFrom: 1961, yearTo: 1994 }],
      },
      {
        name: "5",
        type: "car",
        generations: [
          { name: "R5", yearFrom: 1972, yearTo: 1985 },
          { name: "Turbo", yearFrom: 1980, yearTo: 1986 },
          { name: "Supercinq", yearFrom: 1984, yearTo: 1996 },
        ],
      },
      {
        name: "19",
        type: "car",
        generations: [
          { name: "Phase 1", yearFrom: 1988, yearTo: 1992 },
          { name: "Phase 2", yearFrom: 1992, yearTo: 1996 },
        ],
      },
      {
        name: "Fuego",
        type: "car",
        generations: [{ name: "Fuego", yearFrom: 1980, yearTo: 1985 }],
      },
      {
        name: "Clio",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1990, yearTo: 1998 },
          { name: "Williams", yearFrom: 1993, yearTo: 1996 },
          { name: "Mk2", yearFrom: 1998, yearTo: 2005 },
          { name: "Mk3", yearFrom: 2005, yearTo: 2012 },
          { name: "Mk4", yearFrom: 2012, yearTo: 2019 },
          { name: "Mk5", yearFrom: 2019, yearTo: null },
        ],
      },
      {
        name: "Megane",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1995, yearTo: 2002 },
          { name: "Mk2", yearFrom: 2002, yearTo: 2008 },
          { name: "Mk3", yearFrom: 2008, yearTo: 2016 },
          { name: "Mk4", yearFrom: 2015, yearTo: 2024 },
        ],
      },
      {
        name: "Twingo",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1992, yearTo: 2007 },
          { name: "Mk2", yearFrom: 2007, yearTo: 2014 },
          { name: "Mk3", yearFrom: 2014, yearTo: 2024 },
        ],
      },
      {
        name: "Espace",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1984, yearTo: 1991 },
          { name: "Mk2", yearFrom: 1991, yearTo: 1996 },
          { name: "Mk3", yearFrom: 1996, yearTo: 2002 },
          { name: "Mk4", yearFrom: 2002, yearTo: 2014 },
        ],
      },
    ],
  },
  {
    name: "Saab",
    country: "SE",
    models: [
      {
        name: "99",
        type: "car",
        generations: [{ name: "99", yearFrom: 1968, yearTo: 1984 }],
      },
      {
        name: "900",
        type: "car",
        generations: [
          { name: "Classic", yearFrom: 1978, yearTo: 1993 },
          { name: "NG900", yearFrom: 1993, yearTo: 1998 },
        ],
      },
      {
        name: "9000",
        type: "car",
        generations: [{ name: "9000", yearFrom: 1984, yearTo: 1998 }],
      },
      {
        name: "9-3",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1998, yearTo: 2002 },
          { name: "Mk2", yearFrom: 2002, yearTo: 2014 },
        ],
      },
    ],
  },
  {
    name: "Seat",
    country: "ES",
    models: [
      {
        name: "600",
        type: "car",
        generations: [{ name: "600", yearFrom: 1957, yearTo: 1973 }],
      },
      {
        name: "Ibiza",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1984, yearTo: 1993 },
          { name: "Mk2", yearFrom: 1993, yearTo: 2002 },
          { name: "Mk3", yearFrom: 2002, yearTo: 2008 },
          { name: "Mk4", yearFrom: 2008, yearTo: 2017 },
          { name: "Mk5", yearFrom: 2017, yearTo: null },
        ],
      },
      {
        name: "Leon",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1999, yearTo: 2005 },
          { name: "Mk2", yearFrom: 2005, yearTo: 2012 },
          { name: "Mk3", yearFrom: 2012, yearTo: 2020 },
          { name: "Mk4", yearFrom: 2020, yearTo: null },
        ],
      },
    ],
  },
  {
    name: "Škoda",
    country: "CZ",
    models: [
      {
        name: "130 RS",
        type: "car",
        generations: [{ name: "130 RS", yearFrom: 1975, yearTo: 1980 }],
      },
      {
        name: "Octavia",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1996, yearTo: 2004 },
          { name: "Mk2", yearFrom: 2004, yearTo: 2013 },
          { name: "Mk3", yearFrom: 2012, yearTo: 2020 },
          { name: "Mk4", yearFrom: 2019, yearTo: null },
        ],
      },
      {
        name: "Fabia",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1999, yearTo: 2007 },
          { name: "Mk2", yearFrom: 2007, yearTo: 2014 },
          { name: "Mk3", yearFrom: 2014, yearTo: 2021 },
          { name: "Mk4", yearFrom: 2021, yearTo: null },
        ],
      },
    ],
  },
  {
    name: "Subaru",
    country: "JP",
    models: [
      {
        name: "Impreza",
        type: "car",
        generations: [
          { name: "GC8", yearFrom: 1992, yearTo: 2000 },
          { name: "GD", yearFrom: 2000, yearTo: 2007 },
          { name: "GR", yearFrom: 2007, yearTo: 2014 },
          { name: "VA", yearFrom: 2014, yearTo: 2021 },
        ],
      },
      {
        name: "BRZ",
        type: "car",
        generations: [
          { name: "ZC6", yearFrom: 2012, yearTo: 2020 },
          { name: "ZD8", yearFrom: 2021, yearTo: null },
        ],
      },
      {
        name: "SVX",
        type: "car",
        generations: [{ name: "SVX", yearFrom: 1991, yearTo: 1997 }],
      },
    ],
  },
  {
    name: "Suzuki",
    country: "JP",
    models: [
      {
        name: "Swift",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1983, yearTo: 1989 },
          { name: "Mk2", yearFrom: 1989, yearTo: 2004 },
          { name: "Mk3", yearFrom: 2004, yearTo: 2010 },
          { name: "Mk4", yearFrom: 2010, yearTo: 2017 },
          { name: "Mk5", yearFrom: 2017, yearTo: null },
        ],
      },
      {
        name: "Jimny",
        type: "car",
        generations: [
          { name: "LJ", yearFrom: 1970, yearTo: 1981 },
          { name: "SJ", yearFrom: 1981, yearTo: 1998 },
          { name: "JB", yearFrom: 1998, yearTo: 2018 },
          { name: "JB74", yearFrom: 2018, yearTo: null },
        ],
      },
      {
        name: "GSX-R 1000",
        type: "moto",
        generations: [
          { name: "K1", yearFrom: 2001, yearTo: 2002 },
          { name: "K3", yearFrom: 2003, yearTo: 2004 },
          { name: "K5", yearFrom: 2005, yearTo: 2006 },
          { name: "K7", yearFrom: 2007, yearTo: 2008 },
          { name: "L9", yearFrom: 2009, yearTo: 2016 },
          { name: "L7", yearFrom: 2017, yearTo: null },
        ],
      },
      {
        name: "Hayabusa",
        type: "moto",
        generations: [
          { name: "Gen 1", yearFrom: 1999, yearTo: 2007 },
          { name: "Gen 2", yearFrom: 2008, yearTo: 2020 },
          { name: "Gen 3", yearFrom: 2021, yearTo: null },
        ],
      },
    ],
  },
  {
    name: "Toyota",
    country: "JP",
    models: [
      {
        name: "Supra",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1978, yearTo: 1981 },
          { name: "Mk2", yearFrom: 1981, yearTo: 1986 },
          { name: "Mk3", yearFrom: 1986, yearTo: 1993 },
          { name: "Mk4", yearFrom: 1993, yearTo: 2002 },
          { name: "Mk5", yearFrom: 2019, yearTo: null },
        ],
      },
      {
        name: "Celica",
        type: "car",
        generations: [
          { name: "A20", yearFrom: 1970, yearTo: 1977 },
          { name: "A40", yearFrom: 1977, yearTo: 1981 },
          { name: "A60", yearFrom: 1981, yearTo: 1985 },
          { name: "T160", yearFrom: 1985, yearTo: 1989 },
          { name: "T180", yearFrom: 1989, yearTo: 1993 },
          { name: "T200", yearFrom: 1993, yearTo: 1999 },
          { name: "T230", yearFrom: 1999, yearTo: 2006 },
        ],
      },
      {
        name: "Corolla",
        type: "car",
        generations: [
          { name: "AE86", yearFrom: 1983, yearTo: 1987 },
          { name: "E100", yearFrom: 1991, yearTo: 1997 },
          { name: "E110", yearFrom: 1995, yearTo: 2002 },
          { name: "E120", yearFrom: 2001, yearTo: 2008 },
          { name: "E140", yearFrom: 2006, yearTo: 2013 },
          { name: "E160", yearFrom: 2012, yearTo: 2018 },
          { name: "E210", yearFrom: 2018, yearTo: null },
        ],
      },
      {
        name: "MR2",
        type: "car",
        generations: [
          { name: "AW11", yearFrom: 1984, yearTo: 1989 },
          { name: "SW20", yearFrom: 1989, yearTo: 1999 },
          { name: "W30", yearFrom: 1999, yearTo: 2007 },
        ],
      },
      {
        name: "GT86",
        type: "car",
        generations: [{ name: "ZN6", yearFrom: 2012, yearTo: 2021 }],
      },
      {
        name: "GR86",
        type: "car",
        generations: [{ name: "ZN8", yearFrom: 2021, yearTo: null }],
      },
      {
        name: "GR Yaris",
        type: "car",
        generations: [{ name: "XP210", yearFrom: 2020, yearTo: null }],
      },
      {
        name: "Land Cruiser",
        type: "car",
        generations: [
          { name: "J40", yearFrom: 1960, yearTo: 1984 },
          { name: "J60", yearFrom: 1980, yearTo: 1990 },
          { name: "J80", yearFrom: 1989, yearTo: 1997 },
          { name: "J90", yearFrom: 1996, yearTo: 2002 },
          { name: "J120", yearFrom: 2002, yearTo: 2009 },
          { name: "J150", yearFrom: 2009, yearTo: null },
        ],
      },
    ],
  },
  {
    name: "Triumph",
    country: "GB",
    models: [
      {
        name: "TR4",
        type: "car",
        generations: [
          { name: "TR4", yearFrom: 1961, yearTo: 1965 },
          { name: "TR4A", yearFrom: 1965, yearTo: 1967 },
        ],
      },
      {
        name: "TR6",
        type: "car",
        generations: [{ name: "TR6", yearFrom: 1968, yearTo: 1976 }],
      },
      {
        name: "TR7",
        type: "car",
        generations: [{ name: "TR7", yearFrom: 1975, yearTo: 1981 }],
      },
      {
        name: "Spitfire",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1962, yearTo: 1964 },
          { name: "Mk2", yearFrom: 1964, yearTo: 1967 },
          { name: "Mk3", yearFrom: 1967, yearTo: 1970 },
          { name: "Mk4", yearFrom: 1970, yearTo: 1974 },
          { name: "1500", yearFrom: 1974, yearTo: 1980 },
        ],
      },
      {
        name: "Bonneville",
        type: "moto",
        generations: [
          { name: "T120", yearFrom: 1959, yearTo: 1974 },
          { name: "Gen 1", yearFrom: 2001, yearTo: 2015 },
          { name: "Gen 2", yearFrom: 2016, yearTo: null },
        ],
      },
      {
        name: "Street Triple",
        type: "moto",
        generations: [
          { name: "675", yearFrom: 2007, yearTo: 2016 },
          { name: "765", yearFrom: 2017, yearTo: null },
        ],
      },
    ],
  },
  {
    name: "TVR",
    country: "GB",
    models: [
      {
        name: "Chimaera",
        type: "car",
        generations: [{ name: "Chimaera", yearFrom: 1992, yearTo: 2003 }],
      },
      {
        name: "Cerbera",
        type: "car",
        generations: [{ name: "Cerbera", yearFrom: 1996, yearTo: 2003 }],
      },
      {
        name: "Tuscan",
        type: "car",
        generations: [{ name: "Tuscan", yearFrom: 2000, yearTo: 2006 }],
      },
      {
        name: "Tamora",
        type: "car",
        generations: [{ name: "Tamora", yearFrom: 2002, yearTo: 2006 }],
      },
    ],
  },
  {
    name: "Volkswagen",
    country: "DE",
    models: [
      {
        name: "Golf",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1974, yearTo: 1983 },
          { name: "Mk2", yearFrom: 1983, yearTo: 1992 },
          { name: "Mk3", yearFrom: 1991, yearTo: 1997 },
          { name: "Mk4", yearFrom: 1997, yearTo: 2003 },
          { name: "Mk5", yearFrom: 2003, yearTo: 2008 },
          { name: "Mk6", yearFrom: 2008, yearTo: 2012 },
          { name: "Mk7", yearFrom: 2012, yearTo: 2019 },
          { name: "Mk8", yearFrom: 2019, yearTo: null },
        ],
      },
      {
        name: "Polo",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1975, yearTo: 1981 },
          { name: "Mk2", yearFrom: 1981, yearTo: 1994 },
          { name: "Mk3", yearFrom: 1994, yearTo: 2002 },
          { name: "Mk4", yearFrom: 2001, yearTo: 2009 },
          { name: "Mk5", yearFrom: 2009, yearTo: 2017 },
          { name: "Mk6", yearFrom: 2017, yearTo: null },
        ],
      },
      {
        name: "Scirocco",
        type: "car",
        generations: [
          { name: "Mk1", yearFrom: 1974, yearTo: 1981 },
          { name: "Mk2", yearFrom: 1981, yearTo: 1992 },
          { name: "Mk3", yearFrom: 2008, yearTo: 2017 },
        ],
      },
      {
        name: "Coccinelle",
        type: "car",
        generations: [{ name: "Type 1", yearFrom: 1938, yearTo: 2003 }],
      },
      {
        name: "Corrado",
        type: "car",
        generations: [{ name: "Corrado", yearFrom: 1988, yearTo: 1995 }],
      },
      {
        name: "Combi",
        type: "truck",
        generations: [
          { name: "T1", yearFrom: 1950, yearTo: 1967 },
          { name: "T2", yearFrom: 1967, yearTo: 1979 },
          { name: "T3", yearFrom: 1979, yearTo: 1992 },
          { name: "T4", yearFrom: 1990, yearTo: 2003 },
          { name: "T5", yearFrom: 2003, yearTo: 2015 },
          { name: "T6", yearFrom: 2015, yearTo: 2024 },
        ],
      },
    ],
  },
  {
    name: "Volvo",
    country: "SE",
    models: [
      {
        name: "Amazon",
        type: "car",
        generations: [{ name: "Amazon", yearFrom: 1956, yearTo: 1970 }],
      },
      {
        name: "P1800",
        type: "car",
        generations: [{ name: "P1800", yearFrom: 1961, yearTo: 1973 }],
      },
      {
        name: "240",
        type: "car",
        generations: [{ name: "240", yearFrom: 1974, yearTo: 1993 }],
      },
      {
        name: "850",
        type: "car",
        generations: [{ name: "850", yearFrom: 1991, yearTo: 1996 }],
      },
    ],
  },
  {
    name: "Yamaha",
    country: "JP",
    models: [
      {
        name: "R1",
        type: "moto",
        generations: [
          { name: "1998", yearFrom: 1998, yearTo: 2001 },
          { name: "2002", yearFrom: 2002, yearTo: 2003 },
          { name: "2004", yearFrom: 2004, yearTo: 2006 },
          { name: "2007", yearFrom: 2007, yearTo: 2008 },
          { name: "2009", yearFrom: 2009, yearTo: 2014 },
          { name: "2015", yearFrom: 2015, yearTo: null },
        ],
      },
      {
        name: "R6",
        type: "moto",
        generations: [
          { name: "1999", yearFrom: 1999, yearTo: 2002 },
          { name: "2003", yearFrom: 2003, yearTo: 2005 },
          { name: "2006", yearFrom: 2006, yearTo: 2016 },
          { name: "2017", yearFrom: 2017, yearTo: 2020 },
        ],
      },
      {
        name: "MT-09",
        type: "moto",
        generations: [
          { name: "Gen 1", yearFrom: 2013, yearTo: 2016 },
          { name: "Gen 2", yearFrom: 2017, yearTo: 2020 },
          { name: "Gen 3", yearFrom: 2021, yearTo: null },
        ],
      },
      {
        name: "MT-07",
        type: "moto",
        generations: [
          { name: "Gen 1", yearFrom: 2014, yearTo: 2020 },
          { name: "Gen 2", yearFrom: 2021, yearTo: null },
        ],
      },
      {
        name: "V-Max",
        type: "moto",
        generations: [
          { name: "Série 1", yearFrom: 1985, yearTo: 2007 },
          { name: "Série 2", yearFrom: 2009, yearTo: 2020 },
        ],
      },
    ],
  },
];
