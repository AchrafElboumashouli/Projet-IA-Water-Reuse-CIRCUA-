declare module "plotly.js" {
  const Plotly: {
    downloadImage: (
      graphDiv: unknown,
      opts: { format: "png" | "svg" | "jpeg" | "webp"; filename?: string; width?: number; height?: number }
    ) => Promise<string>;
    [key: string]: unknown;
  };
  export default Plotly;
}

declare module "plotly.js-dist-min" {
  const Plotly: {
    downloadImage: (
      graphDiv: unknown,
      opts: { format: "png" | "svg" | "jpeg" | "webp"; filename?: string; width?: number; height?: number }
    ) => Promise<string>;
    [key: string]: unknown;
  };
  export default Plotly;
}

declare module "react-plotly.js/factory" {
  import type { ComponentType } from "react";
  import type { PlotParams } from "react-plotly.js";
  export default function createPlotlyComponent(plotly: unknown): ComponentType<PlotParams>;
}

declare module "react-plotly.js" {
  import * as React from "react";

  export interface PlotParams {
    data: Array<Record<string, unknown>>;
    layout?: Record<string, unknown>;
    config?: Record<string, unknown>;
    frames?: Array<Record<string, unknown>>;
    style?: React.CSSProperties;
    className?: string;
    useResizeHandler?: boolean;
    onInitialized?: (figure: unknown, graphDiv: HTMLElement) => void;
    onUpdate?: (figure: unknown, graphDiv: HTMLElement) => void;
    onClick?: (event: unknown) => void;
    divId?: string;
  }

  export default class Plot extends React.Component<PlotParams> {}
}
