"use client"

import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  ReferenceLine,
} from "recharts"

interface SparklineProps {
  data: number[]
  color?: string
  showTooltip?: boolean
  height?: number
}

export function Sparkline({
  data,
  color = "#1D9E75",
  showTooltip = false,
  height = 40,
}: SparklineProps) {
  const chartData = data.map((value, index) => ({ value, index }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData}>
        {showTooltip && (
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="bg-white dark:bg-gray-900 border border-border rounded px-2 py-1 text-xs shadow-md">
                    {payload[0].value}
                  </div>
                )
              }
              return null
            }}
          />
        )}
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3, fill: color }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

