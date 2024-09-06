import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';

const SVG_WIDTH = 1200;
const SVG_HEIGHT = 600;
const MARGIN = { top: 40, right: 30, left: 80, bottom: 80 };

const VERSION = "0";
const LAST_EDIT = "2024-03-14 15:30"; // Replace with actual last edit time

function App() {
  const [data, setData] = useState([]);
  const [barColor, setBarColor] = useState('#8884d8');
  const [highlightColor, setHighlightColor] = useState('#0044cc');
  const [hoveredBar, setHoveredBar] = useState(null);
  const [showHorizontalLines, setShowHorizontalLines] = useState(true);
  const [showQuartiles, setShowQuartiles] = useState(false);
  const svgRef = useRef(null);
  const [debugInfo, setDebugInfo] = useState('');
  const [weightedAverageCost, setWeightedAverageCost] = useState(0);
  const [goldPrice, setGoldPrice] = useState(null);
  const [showWeightedAverage, setShowWeightedAverage] = useState(true);
  const [showGoldPrice, setShowGoldPrice] = useState(true);
  const [showXAxisTickers, setShowXAxisTickers] = useState(true);

  const handleFileUpload = useCallback((event) => {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const rows = text.split('\n').map(row => {
        // Use regex to split the row, keeping quoted values intact
        return row.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
      });
      
      const parsedData = rows.slice(1)
        .filter(row => row && row.length >= 4)
        .map((row, index) => ({
          name: row[0].replace(/"/g, '').trim(),
          production: parseFloat(row[1].replace(/[",]/g, '')) || 0,
          cost: parseFloat(row[2]) || 0,
          highlight: row[3] ? row[3].trim() === '1' : false,
          id: index
        }))
        .filter(item => item.production > 0 && item.cost > 0);

      const debugText = `
Raw CSV data (first 500 chars): ${text.substring(0, 500)}...

First 5 split rows:
${JSON.stringify(rows.slice(0, 5), null, 2)}

First 5 parsed data points:
${JSON.stringify(parsedData.slice(0, 5), null, 2)}

Total rows: ${rows.length}
Parsed data points: ${parsedData.length}
Filtered out items: ${rows.length - 1 - parsedData.length}
      `;

      setDebugInfo(debugText);
      setData(parsedData.sort((a, b) => a.cost - b.cost));
    };
    reader.readAsText(file);
  }, []);

  const { cumulativeData, maxCost, totalProduction, quartiles } = useMemo(() => {
    let cumulative = 0;
    let maxCost = 0;
    const cumulativeData = data.map(item => {
      const result = { ...item, cumulativeProduction: cumulative };
      cumulative += item.production;
      maxCost = Math.max(maxCost, item.cost);
      return result;
    });

    const sortedCosts = cumulativeData.map(item => item.cost).sort((a, b) => a - b);
    const len = sortedCosts.length;
    const q1 = sortedCosts[Math.floor(len * 0.25)] || 0;
    const median = sortedCosts[Math.floor(len * 0.5)] || 0;
    const q3 = sortedCosts[Math.floor(len * 0.75)] || 0;

    return { cumulativeData, maxCost, totalProduction: cumulative, quartiles: { q1, median, q3 } };
  }, [data]);

  const chartWidth = SVG_WIDTH - MARGIN.left - MARGIN.right;
  const chartHeight = SVG_HEIGHT - MARGIN.top - MARGIN.bottom;

  const formatNumber = (value, decimals = 2, prefix = '') => {
    return value ? `${prefix}${value.toLocaleString(undefined, {minimumFractionDigits: decimals, maximumFractionDigits: decimals})}` : '0';
  };

  const getBars = useMemo(() => {
    const barPadding = 1;
    return cumulativeData.map((item) => {
      const x = (item.cumulativeProduction / totalProduction) * chartWidth + MARGIN.left;
      const width = Math.max((item.production / totalProduction) * chartWidth - barPadding, 1);
      const y = SVG_HEIGHT - MARGIN.bottom - (item.cost / maxCost) * chartHeight;
      const height = (item.cost / maxCost) * chartHeight;

      return (
        <rect
          key={item.id}
          x={x}
          y={y}
          width={width}
          height={height}
          fill={item.highlight ? highlightColor : barColor}
          onMouseEnter={() => setHoveredBar(item)}
          onMouseLeave={() => setHoveredBar(null)}
        >
          <title>{`${item.name}\nCost: ${formatNumber(item.cost, 2, '$')}/oz\nProduction: ${formatNumber(item.production, 0)} koz`}</title>
        </rect>
      );
    });
  }, [cumulativeData, maxCost, totalProduction, barColor, highlightColor, chartHeight, chartWidth]);

  const yAxisTicks = useMemo(() => {
    if (!showHorizontalLines) return null;
    const tickCount = Math.ceil(maxCost / 500);
    return Array.from({ length: tickCount + 1 }, (_, i) => {
      const value = 500 * i;
      const y = SVG_HEIGHT - MARGIN.bottom - (value / maxCost) * chartHeight;
      return (
        <g key={i}>
          <line x1={MARGIN.left} y1={y} x2={SVG_WIDTH - MARGIN.right} y2={y} stroke="lightgray" />
          <text x={MARGIN.left - 10} y={y} textAnchor="end" dominantBaseline="middle">
            {formatNumber(value, 0, '$')}
          </text>
        </g>
      );
    });
  }, [maxCost, chartHeight, showHorizontalLines]);

  const xAxisTicks = useMemo(() => {
    if (!showXAxisTickers) return null;
    const tickInterval = 10000;
    const maxTick = Math.floor(totalProduction / tickInterval) * tickInterval;
    const ticks = [];
    for (let i = 0; i <= maxTick; i += tickInterval) {
      const x = (i / totalProduction) * chartWidth + MARGIN.left;
      ticks.push(
        <g key={i}>
          <line x1={x} y1={SVG_HEIGHT - MARGIN.bottom} x2={x} y2={SVG_HEIGHT - MARGIN.bottom + 5} stroke="black" />
          <text x={x} y={SVG_HEIGHT - MARGIN.bottom + 20} textAnchor="middle">
            {i.toLocaleString()}
          </text>
        </g>
      );
    }
    return ticks;
  }, [totalProduction, chartWidth, showXAxisTickers]);

  const highlightedLabels = useMemo(() => {
    return cumulativeData
      .filter(item => item.highlight)
      .map((item, index) => {
        const x = (item.cumulativeProduction / totalProduction) * chartWidth + MARGIN.left;
        const y = SVG_HEIGHT - MARGIN.bottom - (item.cost / maxCost) * chartHeight;
        return (
          <g key={index}>
            <text
              x={x}
              y={SVG_HEIGHT - MARGIN.bottom + 40}
              textAnchor="middle"
              fill={highlightColor}
            >
              {item.name}
            </text>
            <text
              x={x}
              y={y - 10}
              textAnchor="middle"
              fill={highlightColor}
              fontWeight="bold"
              style={{ background: 'white' }}
            >
              {formatNumber(item.cost, 2, '$')}/oz
            </text>
          </g>
        );
      });
  }, [cumulativeData, chartWidth, totalProduction, maxCost, highlightColor]);

  const quartileLines = useMemo(() => {
    if (!showQuartiles) return null;
    return Object.entries(quartiles).map(([key, value]) => {
      const x = (cumulativeData.find(item => item.cost >= value)?.cumulativeProduction / totalProduction) * chartWidth + MARGIN.left;
      return (
        <g key={key}>
          <line
            x1={x}
            y1={MARGIN.top}
            x2={x}
            y2={SVG_HEIGHT - MARGIN.bottom}
            stroke="#FF6B6B"
            strokeWidth={2}
            strokeDasharray="5,5"
          />
          <text
            x={x}
            y={MARGIN.top - 10}
            textAnchor="middle"
            fill="#FF6B6B"
            fontWeight="bold"
          >
            {key.toUpperCase()}: {formatNumber(value, 2, '$')}
          </text>
        </g>
      );
    });
  }, [quartiles, cumulativeData, totalProduction, chartWidth, showQuartiles]);

  const handleDownload = useCallback(() => {
    const svg = svgRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = SVG_WIDTH;
    canvas.height = SVG_HEIGHT;
    const ctx = canvas.getContext("2d");
    
    const data = (new XMLSerializer()).serializeToString(svg);
    const DOMURL = window.URL || window.webkitURL || window;
    
    const img = new Image();
    const svgBlob = new Blob([data], {type: "image/svg+xml;charset=utf-8"});
    const url = DOMURL.createObjectURL(svgBlob);
    
    img.onload = function () {
      ctx.drawImage(img, 0, 0);
      DOMURL.revokeObjectURL(url);
      
      const imgURI = canvas
        .toDataURL("image/png")
        .replace("image/png", "image/octet-stream");
      
      const evt = new MouseEvent("click", {
        view: window,
        bubbles: false,
        cancelable: true
      });
      
      const a = document.createElement("a");
      a.setAttribute("download", "cost_curve.png");
      a.setAttribute("href", imgURI);
      a.setAttribute("target", '_blank');
      a.dispatchEvent(evt);
    };
    
    img.src = url;
  }, []);

  useEffect(() => {
    // Calculate weighted average cost
    const totalProduction = data.reduce((sum, item) => sum + item.production, 0);
    const weightedSum = data.reduce((sum, item) => sum + item.cost * item.production, 0);
    const averageCost = weightedSum / totalProduction;
    setWeightedAverageCost(averageCost);
  }, [data]);

  useEffect(() => {
    // Fetch gold price
    const fetchGoldPrice = async () => {
      try {
        const response = await fetch('https://api.metalpriceapi.com/v1/latest?api_key=9f2b27cbd18c91106c7ef6c340f679cd&base=XAU&currencies=USD');
        const data = await response.json();
        setGoldPrice(data.rates.USD);
      } catch (error) {
        console.error('Error fetching gold price:', error);
      }
    };

    fetchGoldPrice();
  }, []);

  return (
    <div style={{ fontFamily: 'Arial, sans-serif' }}>
      <div style={{ background: 'linear-gradient(to bottom, #333333, #1a1a1a)', color: 'white', padding: '20px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
  <img 
    src={process.env.PUBLIC_URL + '/FM.jpeg'} 
    alt="Fraser McGill" 
    style={{ width: '50px', marginRight: '20px' }} 
  />
  <h1>Fraser McGill Cost Curve Visualizer</h1>
</div>
<div style={{ display: 'flex', alignItems: 'center', marginTop: '10px' }}>
  <p style={{ fontSize: '14px', marginRight: '10px' }}>Developed by</p>
  <img 
    src={process.env.PUBLIC_URL + '/brandmark-design (3).png'} 
    alt="Vectr Labs" 
    style={{ width: '150px' }} 
  />
</div>
        <div style={{ position: 'absolute', bottom: '5px', right: '10px', fontSize: '12px' }}>
          Version {VERSION} | Last updated: {LAST_EDIT}
        </div>
      </div>

      <input type="file" onChange={handleFileUpload} accept=".csv" />
      <br /><br />
      <label>
        Bar Color: 
        <input type="color" value={barColor} onChange={(e) => setBarColor(e.target.value)} />
      </label>
      <label style={{ marginLeft: '10px' }}>
        Highlight Color: 
        <input type="color" value={highlightColor} onChange={(e) => setHighlightColor(e.target.value)} />
      </label>
      <br /><br />
      <label>
        <input
          type="checkbox"
          checked={showHorizontalLines}
          onChange={(e) => setShowHorizontalLines(e.target.checked)}
        />
        Show Horizontal Lines
      </label>
      <label style={{ marginLeft: '10px' }}>
        <input
          type="checkbox"
          checked={showQuartiles}
          onChange={(e) => setShowQuartiles(e.target.checked)}
        />
        Show Quartiles and Median
      </label>
      <label style={{ marginLeft: '10px' }}>
        <input
          type="checkbox"
          checked={showWeightedAverage}
          onChange={(e) => setShowWeightedAverage(e.target.checked)}
        />
        Show Weighted Average
      </label>
      <label style={{ marginLeft: '10px' }}>
        <input
          type="checkbox"
          checked={showGoldPrice}
          onChange={(e) => setShowGoldPrice(e.target.checked)}
        />
        Show Gold Price
      </label>
      <label style={{ marginLeft: '10px' }}>
        <input
          type="checkbox"
          checked={showXAxisTickers}
          onChange={(e) => setShowXAxisTickers(e.target.checked)}
        />
        Show X-Axis Tickers
      </label>
      <br /><br />
      <button onClick={handleDownload} style={{ marginBottom: '10px' }}>
        Download Graph as Image
      </button>

      <svg ref={svgRef} width={SVG_WIDTH} height={SVG_HEIGHT}>
        {getBars}
        {highlightedLabels}
        <line x1={MARGIN.left} y1={SVG_HEIGHT - MARGIN.bottom} x2={SVG_WIDTH - MARGIN.right} y2={SVG_HEIGHT - MARGIN.bottom} stroke="black" />
        <text x={SVG_WIDTH / 2} y={SVG_HEIGHT - 10} textAnchor="middle">Cumulative Production (koz)</text>
        {xAxisTicks}
        <line x1={MARGIN.left} y1={MARGIN.top} x2={MARGIN.left} y2={SVG_HEIGHT - MARGIN.bottom} stroke="black" />
        <text 
          x={25} 
          y={SVG_HEIGHT / 2} 
          textAnchor="middle" 
          transform={`rotate(-90 25 ${SVG_HEIGHT / 2})`}
        >
          Cost ($/oz)
        </text>
        {yAxisTicks}
        {quartileLines}
        {hoveredBar && (
          <text
            x={SVG_WIDTH / 2}
            y={50}
            textAnchor="middle"
            fill='black'
            fontWeight="bold"
          >
            {`${hoveredBar.name} - Cost: ${formatNumber(hoveredBar.cost, 2, '$')}/oz, Production: ${formatNumber(hoveredBar.production, 0)} koz`}
          </text>
        )}

        {/* Weighted Average Cost Line */}
        {showWeightedAverage && weightedAverageCost > 0 && (
          <g>
            <line
              x1={MARGIN.left}
              y1={SVG_HEIGHT - MARGIN.bottom - (weightedAverageCost / maxCost) * chartHeight}
              x2={SVG_WIDTH - MARGIN.right}
              y2={SVG_HEIGHT - MARGIN.bottom - (weightedAverageCost / maxCost) * chartHeight}
              stroke="black"
              strokeWidth={2}
              strokeDasharray="5,5"
            />
            <text
              x={SVG_WIDTH - MARGIN.right - 5}
              y={SVG_HEIGHT - MARGIN.bottom - (weightedAverageCost / maxCost) * chartHeight - 5}
              fill="black"
              textAnchor="end"
              dominantBaseline="bottom"
            >
              Ave: ${weightedAverageCost.toFixed(2)}
            </text>
          </g>
        )}

        {/* Gold Price Line */}
        {showGoldPrice && goldPrice && (
          <g>
            <line
              x1={MARGIN.left}
              y1={SVG_HEIGHT - MARGIN.bottom - (goldPrice / maxCost) * chartHeight}
              x2={SVG_WIDTH - MARGIN.right}
              y2={SVG_HEIGHT - MARGIN.bottom - (goldPrice / maxCost) * chartHeight}
              stroke="gold"
              strokeWidth={2}
              strokeDasharray="5,5"
            />
            <text
              x={SVG_WIDTH - MARGIN.right - 5}
              y={SVG_HEIGHT - MARGIN.bottom - (goldPrice / maxCost) * chartHeight - 5}
              fill="gold"
              textAnchor="end"
              dominantBaseline="bottom"
            >
              Current price: ${goldPrice.toFixed(2)}
            </text>
          </g>
        )}
      </svg>

      {/* Display current gold price */}
      {goldPrice && (
        <div style={{ marginTop: '10px' }}>
          Current Gold Price: ${goldPrice.toFixed(2)} per oz
        </div>
      )}
    </div>
  );
}

export default App;