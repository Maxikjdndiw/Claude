/**
 * Economics concepts for the learning layer. Each concept has a short
 * plain-language explanation. The game fills in a live example the first time
 * a concept matters to you. Add concepts here; trigger them by tagging an
 * event with `concept: '<id>'` or with a detector in sim/learning.ts.
 */
export interface ConceptDef {
  id: string;
  title: string;
  /** One or two sentences, plain language. */
  summary: string;
  /** A little more depth for the glossary. */
  detail: string;
  topic: 'Markets' | 'Production' | 'Costs & accounting' | 'Labor' | 'Finance' | 'Macroeconomy' | 'Strategy';
}

export const CONCEPTS: ConceptDef[] = [
  // ---------------------------------------------------------------- markets
  {
    id: 'supply-demand',
    title: 'Supply and demand',
    topic: 'Markets',
    summary: 'Prices rise when buyers want more than sellers offer and fall when supply outgrows demand.',
    detail:
      'Every town is a market. When you (or rivals) deliver more than people buy, stocks pile up and the price drops until consumption rises and outside suppliers back off. The price where quantity supplied equals quantity demanded is the equilibrium.',
  },
  {
    id: 'elasticity',
    title: 'Price elasticity of demand',
    topic: 'Markets',
    summary: 'How strongly the quantity people buy reacts to a price change.',
    detail:
      'Necessities like bread or fuel are inelastic: people keep buying even when prices rise. Luxuries like furniture are elastic: a small price rise sends buyers away. With inelastic demand, flooding a market crashes the price fast.',
  },
  {
    id: 'income-elasticity',
    title: 'Income elasticity',
    topic: 'Markets',
    summary: 'How demand reacts when people get richer or poorer.',
    detail:
      'Luxury goods have high income elasticity: in a boom furniture sales soar, in a recession they collapse. Basic food barely changes. That is why some industries are much more cyclical than others.',
  },
  {
    id: 'arbitrage',
    title: 'Arbitrage and the law of one price',
    topic: 'Markets',
    summary: 'Buying where a good is cheap and selling where it is dear, until the price gap shrinks to the transport cost.',
    detail:
      'If wheat costs $30 in one town and $50 in another and transport costs $8, traders profit by shipping it. Their buying raises the low price and their selling lowers the high one. In equilibrium, prices differ by at most the cost of moving goods.',
  },
  {
    id: 'competition',
    title: 'Competition',
    topic: 'Markets',
    summary: 'More sellers in a market means more supply, lower prices and thinner margins for everyone.',
    detail:
      'You compete with rivals for customers (prices), for workers (wages) and for resources (deposits, forests, fish). Market share tells you how much of a market you supply.',
  },
  {
    id: 'market-entry',
    title: 'Market entry',
    topic: 'Markets',
    summary: 'High profits attract new competitors, whose extra supply pushes prices and profits back down.',
    detail:
      'Above-normal profits are a signal. In a competitive market they do not last: firms enter until the price falls to the point where profits are normal again.',
  },
  {
    id: 'market-exit',
    title: 'Market exit',
    topic: 'Markets',
    summary: 'Firms that cannot cover their costs leave the market, which lets prices recover for the survivors.',
    detail:
      'In the short run a firm keeps producing as long as revenue covers its variable costs. In the long run it must cover fixed costs too, or exit.',
  },
  {
    id: 'supply-shock',
    title: 'Supply shock',
    topic: 'Markets',
    summary: 'A sudden drop (or rise) in supply that moves prices sharply.',
    detail:
      'When outside supply is disrupted (an oil crisis, a failed harvest abroad), prices jump. Local producers of that good earn windfall profits; everyone who uses it as an input pays more.',
  },
  {
    id: 'demand-shock',
    title: 'Demand shock',
    topic: 'Markets',
    summary: 'A sudden change in how much people want to buy.',
    detail: 'Fashions, construction booms or recessions shift the whole demand curve. Prices and quantities move together in the same direction.',
  },
  // ---------------------------------------------------------------- production
  {
    id: 'diminishing-returns',
    title: 'Diminishing marginal returns',
    topic: 'Production',
    summary: 'Each extra worker in the same plant adds a bit less output than the one before.',
    detail:
      'With a fixed amount of machines and space, workers start getting in each other\'s way. Hire only while the value of the extra output (marginal product × price) is higher than the wage.',
  },
  {
    id: 'economies-of-scale',
    title: 'Economies of scale',
    topic: 'Production',
    summary: 'Bigger plants produce each unit more cheaply because fixed costs are spread over more output.',
    detail:
      'Expanding a building raises capacity faster than its upkeep. The average cost per ton falls. But scale only pays if you can sell the extra output without crashing your own price.',
  },
  {
    id: 'value-added',
    title: 'Value added',
    topic: 'Production',
    summary: 'The extra value created by turning inputs into a more valuable product.',
    detail:
      'A mill turning $50 of wheat into $95 of flour adds $45 of value per ton, which pays for workers, capital and profit. Longer production chains capture more value added.',
  },
  {
    id: 'productivity',
    title: 'Productivity and technology',
    topic: 'Production',
    summary: 'Better technology produces more output from the same inputs, lowering cost per unit.',
    detail: 'Technological progress is the main source of long-run growth: the same workers and machines produce more.',
  },
  {
    id: 'rnd',
    title: 'Research & development',
    topic: 'Production',
    summary: 'Spending today on knowledge that lowers costs or opens new markets tomorrow.',
    detail:
      'R&D is an investment with an uncertain, delayed payoff. You can also buy a license: faster, but more expensive. That is the make-or-buy decision.',
  },
  {
    id: 'depletion',
    title: 'Non-renewable resources',
    topic: 'Production',
    summary: 'Ore and oil deposits are finite: every ton mined is gone forever.',
    detail: 'As a deposit runs down, output falls and costs rise. A mine is worth only what is left in the ground.',
  },
  {
    id: 'commons',
    title: 'Tragedy of the commons',
    topic: 'Production',
    summary: 'When everyone harvests a shared resource, each takes too much and the resource collapses.',
    detail:
      'Forests and fish regrow, but only so fast. If several firms log or fish the same area, each gains from harvesting more while the cost (a depleted stock) is shared. The result is overuse.',
  },
  {
    id: 'exploration',
    title: 'Exploration and risk',
    topic: 'Strategy',
    summary: 'Paying to search for resources is a gamble with an uncertain payoff.',
    detail: 'A survey can find a valuable oil field or nothing at all. Firms spread such risks over many attempts.',
  },
  {
    id: 'infrastructure',
    title: 'Infrastructure',
    topic: 'Strategy',
    summary: 'Roads, railways and harbors are big fixed investments that make every later shipment cheaper.',
    detail: 'Infrastructure has high up-front costs and low running costs. It pays off with volume. Roads here are shared: rivals can use yours too (a public good).',
  },
  {
    id: 'transport-costs',
    title: 'Transport costs',
    topic: 'Strategy',
    summary: 'Moving goods costs money and time, so cheap bulky goods are best sold close to where they are made.',
    detail:
      'Trucks are flexible but expensive per ton-km; trains and ships need big investments but move bulk cheaply. Where you build decides how far your goods can travel profitably.',
  },
  {
    id: 'comparative-location',
    title: 'Location advantage',
    topic: 'Strategy',
    summary: 'Where you produce matters: near resources, near customers, or near cheap transport.',
    detail: 'Fertile soil raises farm output, deposits enable mining, and towns supply workers and customers. Good locations create lasting cost advantages.',
  },
  // ---------------------------------------------------------------- costs
  {
    id: 'fixed-costs',
    title: 'Fixed vs variable costs',
    topic: 'Costs & accounting',
    summary: 'Fixed costs (upkeep, depreciation) are paid no matter what; variable costs (wages, materials, transport) grow with output.',
    detail:
      'Revenue minus variable costs is the contribution margin. It must cover the fixed costs before there is any profit. High fixed costs make a business risky when sales drop.',
  },
  {
    id: 'opportunity-cost',
    title: 'Opportunity cost',
    topic: 'Costs & accounting',
    summary: 'The cost of a choice is what you give up: the best alternative use of the money.',
    detail: 'Putting $50,000 into a mill means not earning interest on it, not repaying a loan and not building something else. A project must beat those alternatives.',
  },
  {
    id: 'sunk-cost',
    title: 'Sunk costs',
    topic: 'Costs & accounting',
    summary: 'Money already spent and unrecoverable should not influence future decisions.',
    detail: 'Whether a failed survey or a demolished plant cost a lot does not matter now. Only future costs and revenues count.',
  },
  {
    id: 'depreciation',
    title: 'Depreciation',
    topic: 'Costs & accounting',
    summary: 'A building\'s cost is spread over its useful life as an expense, even though the cash was paid up front.',
    detail: 'That is why profit and cash differ: investment hits cash immediately but the income statement only gradually.',
  },
  {
    id: 'cashflow',
    title: 'Profit is not cash',
    topic: 'Costs & accounting',
    summary: 'A profitable company can still run out of money: investment, loan repayments and stock all need cash.',
    detail: 'The cash flow statement shows operating, investing and financing flows. Most bankruptcies are cash crises, not lack of profit.',
  },
  // ---------------------------------------------------------------- labor
  {
    id: 'wages',
    title: 'Labor market and wages',
    topic: 'Labor',
    summary: 'Wages are a price too: when workers are scarce, you must pay more to hire and keep them.',
    detail:
      'If your pay is below the going rate, workers quit for better jobs. Low unemployment means a tight labor market and rising wages.',
  },
  {
    id: 'human-capital',
    title: 'Human capital',
    topic: 'Labor',
    summary: 'Skills raise productivity; training is an investment in your workers.',
    detail: 'Trained workers produce more, but when they quit the investment walks out the door. That is a reason to pay fair wages.',
  },
  {
    id: 'minimum-wage',
    title: 'Minimum wage',
    topic: 'Labor',
    summary: 'A legal floor on wages: it raises pay for low earners but increases labor costs.',
    detail: 'Firms with thin margins may hire fewer workers or invest in automation instead.',
  },
  // ---------------------------------------------------------------- finance
  {
    id: 'interest',
    title: 'Interest and leverage',
    topic: 'Finance',
    summary: 'Borrowing lets you invest more than you own. It pays when the investment earns more than the interest rate.',
    detail:
      'Leverage magnifies both gains and losses. Banks charge riskier companies more (credit spread), and variable-rate loans get dearer when the central bank raises rates.',
  },
  {
    id: 'credit-rating',
    title: 'Credit rating',
    topic: 'Finance',
    summary: 'Lenders judge how likely you are to repay. More debt and weaker profits mean a worse rating and higher rates.',
    detail: 'Leverage (debt / assets) and interest coverage (profit / interest) drive your rating.',
  },
  {
    id: 'ipo',
    title: 'Going public (IPO)',
    topic: 'Finance',
    summary: 'Selling shares to investors raises cash without debt, in exchange for part of future profits and control.',
    detail: 'Equity does not have to be repaid, but shareholders expect returns, dividends and a say in how the company is run.',
  },
  {
    id: 'share-price',
    title: 'Share prices',
    topic: 'Finance',
    summary: 'A share price reflects expected future profits, discounted by interest rates and moved by market mood.',
    detail:
      'Prices react to earnings surprises. When interest rates rise, future profits are worth less today, so share prices tend to fall (a lower P/E ratio).',
  },
  {
    id: 'dividend',
    title: 'Dividends',
    topic: 'Finance',
    summary: 'Paying profits out to shareholders instead of reinvesting them.',
    detail: 'A dividend rewards owners now; retaining the cash funds growth that may be worth more later.',
  },
  {
    id: 'dilution',
    title: 'Dilution',
    topic: 'Finance',
    summary: 'Issuing new shares raises money but shrinks every existing owner\'s percentage.',
    detail: 'Owning 70% of a bigger company can beat owning 100% of a small one. But dilution can also cost you control.',
  },
  {
    id: 'corporate-control',
    title: 'Corporate control',
    topic: 'Finance',
    summary: 'Whoever owns more than half of the shares controls the company.',
    detail: 'Sell too much of your company and a rival can buy a majority, or the board can replace you if results disappoint.',
  },
  {
    id: 'takeover',
    title: 'Takeovers',
    topic: 'Finance',
    summary: 'Buying a majority of another company to take control of its assets and markets.',
    detail: 'A takeover can remove a competitor and add capacity, but you usually pay a premium over the market price.',
  },
  {
    id: 'bankruptcy',
    title: 'Bankruptcy',
    topic: 'Finance',
    summary: 'When a company cannot pay its debts, it fails and its assets are sold off.',
    detail: 'Its customers, workers and market share become available to the survivors: "creative destruction".',
  },
  // ---------------------------------------------------------------- macro
  {
    id: 'business-cycle',
    title: 'The business cycle',
    topic: 'Macroeconomy',
    summary: 'Economies swing between booms and recessions, changing incomes, demand and unemployment.',
    detail: 'In a recession demand falls (luxuries most), unemployment rises and wages soften. In a boom it is the reverse. Firms with high fixed costs and debt suffer most in downturns.',
  },
  {
    id: 'inflation',
    title: 'Inflation',
    topic: 'Macroeconomy',
    summary: 'A general rise in prices: each dollar buys less over time.',
    detail: 'Inflation erodes the value of cash and of debts. Borrowers gain, savers lose. Wages must rise just to keep workers equally well off.',
  },
  {
    id: 'monetary-policy',
    title: 'Central bank and interest rates',
    topic: 'Macroeconomy',
    summary: 'The central bank raises rates to cool inflation and cuts them to fight recessions.',
    detail: 'Higher rates make loans dearer and share prices lower; lower rates do the opposite. This is how monetary policy reaches companies.',
  },
  {
    id: 'regulation',
    title: 'Regulation and externalities',
    topic: 'Macroeconomy',
    summary: 'Governments tax or regulate activities that harm others (pollution), raising costs for those industries.',
    detail: 'An emissions levy makes polluters pay for the damage they cause (a negative externality), shifting the advantage to cleaner producers.',
  },
  {
    id: 'disaster',
    title: 'Risk and insurance',
    topic: 'Strategy',
    summary: 'Floods, fires and storms hit without warning. Spreading assets across locations reduces the damage.',
    detail: 'Diversification lowers risk: not all your plants will be hit at once. Keep a cash buffer for repairs.',
  },
];

export const CONCEPT: Record<string, ConceptDef> = Object.fromEntries(CONCEPTS.map((c) => [c.id, c]));
