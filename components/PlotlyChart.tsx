"use client";

import dynamic from "next/dynamic";
import type { PlotParams } from "react-plotly.js";
import type { ComponentType } from "react";

// On utilise le bundle navigateur pré-compilé `plotly.js-dist-min` (via la
// factory de react-plotly.js) plutôt que le paquet `plotly.js` complet :
// ce dernier cible aussi Node et référence des modules ("buffer/", ...)
// que le bundler de Next.js ne résout pas côté client.
const Plot = dynamic(
  async () => {
    const [{ default: createPlotlyComponent }, { default: Plotly }] = await Promise.all([
      import("react-plotly.js/factory"),
      import("plotly.js-dist-min"),
    ]);
    return createPlotlyComponent(Plotly);
  },
  { ssr: false }
) as ComponentType<PlotParams>;

export default Plot;
