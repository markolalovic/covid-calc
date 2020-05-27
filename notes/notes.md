\( x = 2 /cdot y + \frac{1}{2} )\

$ x = 2 /cdot y + \frac{1}{2} $

**Summary.** At the time of writing, the impacts of Coronavirus disease of 2019
remain largely uncertain and depend on a whole range of possibilities.

Organizing the overwhelming mass of the available information in the media and literature,
coming up with a reasonable working estimates and comparing multiple scenarios can be challenging,
especially to the non-expert such as myself.

As an attempt to address this problem I used publicly available data and published information
to create this international tool that allows users to derive their own country-specific estimates available at:

[markolalovic.github.io/covid-calc](https://markolalovic.github.io/covid-calc/)

There are lots of improvements possible or more things to consider.

One is to also include estimated fatality risks of COVID-19 by pre-existing health conditions. Having time to event data and applying survival analysis techniques would result in a more sensible estimates of expected years of life lost. Allowing parameters to evolve over time and comparing different time spans is another improvement. Users should be aware this tool is focused on simple presentation and pedagogical aspects and only offers crude estimates. It uses relatively simplistic methodology outlined in [Technical Details](#td) below.

## Technical Details {#td}
Denote "number of sth" with $n(\cdot)$, e.g. $n(\text{people in the world}) \approx 7.59B$.

### Age Structure
For selected location population we use data about age from 2019, source [@pyramids]. We divide the age in years in 9 intervals or *age groups*
$$
G =
  \{ \text{0-9}, \text{10-19}, \ldots, \text{70-79}, \text{80+} \}
$$

*Age structure* $N(g)$ is the size of population by age group $g \in G$. We estimate it by counting how many people fall into each age group $g \in G$
$$
N(g) =
  n(\text{people in age group g})
$$

We estimate *total population size* $N$ by
$$
N = \sum_{g \in G}
  n(\text{people in age group g})
$$

For a more detailed analysis, we divide all age groups into two sets:
\begin{align*}
G_{<60} &=
  \{ \text{0-9}, \text{10-19}, \ldots, \text{50-59} \} \\
G_{60+} &=
  \{ \text{60-69}, \text{70-79}, \text{80+} \}
\end{align*}

and estimate the proportion of people over 60 in selected population as
$$
d_{60+} = \sum_{g \in G_{60+}} N(g) / N
$$

### Fatality Risks
*Infection Fatality Risk (IFR)* represents the proportion of deaths among all the infected individuals
$$
FR =
  n(\text{deaths}) /
  n(\text{infected})
$$

*Case Fatality Risk (CFR)* represents the proportion of confirmed deaths among all confirmed infected individuals
$$
CFR =
 n( \text{confirmed cases of deaths} ) /
 n( \text{confirmed cases of infected} )
$$

We use estimates of IFR(g) by age group from [@imperial] by default. Users can select to use estimates of CFR(g) by age group based on data from different countries, source [@cfrs].

For example if in some particular time frame we had 5 confirmed cases of people infected and 2 confirmed deaths. Then $CFR = 2/5 = 0.4$. But if, based on some other data and not only on confirmed cases, we know that there are actually more people infected, than our estimated IFR will be smaller than CFR.

Users can also adjust fatality risk of each age group by input parameter $F$. It represents percent of increase or decrease.

To get *Fatality Risk by age group* $FR(g)$, we multiply selected estimates of fatality risk for each age group $g \in G$ by $1 + \frac{F}{100}$ and use it as an estimate of true IFR:
$$
FR(g) =
\begin{cases}
   IFR(g) \cdot (1 + \frac{F}{100}), & \text{if user selects IFR estimates}\\
   CFR(g) \cdot (1 + \frac{F}{100}), & \text{if user selects CFR estimates}
\end{cases}
$$

Notes:

* In epidemiology instead of *risk*, the term *rate* or *ratio* is often used. However FR is a measure of risk, this means a proportion of incidence and not rate or ratio, more in [@cfr_wiki].
* Since $\text{confirmed cases of infected} \subseteq \text{infected}$, wider testing can reduce CFR estimates.
* When using CFR, the expected number of deaths in age group 0-9 is always 0 since no children under 10 appear to have died from COVID-19 until this data was aquired.
* Our proposed approach for later estimation assumes that the fatality risk by age in selected location has distribution similar to that estimated by [@imperial] or observed in the country of selected CFR [@cfrs].

### Proportion of Infected
The selected *proportion of infected* $H$ is
$$
H = n(\text{infected}) \cdot 100 / N
$$

Users can adjust the proportion of people over 60 infected using $H_{60+}$. The overall $H$ can be decomposed as:

\begin{equation}   \tag{1}
H = (1 - d_{60+}) \cdot H_{<60} + d_{60+} \cdot H_{60+}
\end{equation}

where $H_{<60}$ is proportion of people below 60 infected and is calculated from Eq. (1).


### Probability of Eliminating COVID-19
Let $A$ be the event of achieving complete elimination of COVID-19 disease before it manages to infect $H$ percent of population. And let $I_{A}$ be the indicator variable for event $A$. Then
\begin{align*}
E &= \text{Pr}(I_{A} = 1) \cdot 100 \\
U &= n(\text{infected until elimination}) \cdot 100 / N
\end{align*}

To keep the number of parameters low let
\begin{equation}   \tag{2}
U_{60+} / U = H_{60+} / H
\end{equation}
so we calculate proportion of people over 60 infected until elimination $U_{60+}$ from Eq. (2) and proportion of people below 60 infected until elimination $U_{<60}$ from decomposition of $U$, i.e. equation
\begin{equation}
U = (1 - d_{60+}) \cdot U_{<60} + d_{60+} \cdot U_{60+}
\end{equation}

### Expected Number of Infected and Expected Number of Deaths
We estimate expected number of infected in age group $g \in G$ as
\begin{equation}
  \text{E} \left[ n(\text{infected in age group g}) \right] =
  \begin{cases}
    (1 - E/100) \cdot N(g) \cdot H_{<60} + E/100 \cdot N(g) \cdot U_{<60}, & \text{if } g \in G_{<60}\\
    (1 - E/100) \cdot N(g) \cdot H_{60+} + E/100 \cdot N(g) \cdot U_{60+}, & \text{if } g \in G_{60+}\\  
  \end{cases}
\end{equation}

and expected number of deaths in age group $g \in G$ as
\begin{equation}
  \text{E} \left[ n(\text{deaths in age group g}) \right] =
    \text{E} \left[ n(\text{infected in age group g}) \right] \cdot FR(g)
\end{equation}

Total expected numbers are simply sums over all age groups
\begin{align*}
  \text{E} \left[ n(\text{infected}) \right] &= \sum_{g \in G} \text{E} \left[ n(\text{infected in age group g}) \right] \\
  \text{E} \left[ n(\text{deaths}) \right] &= \sum_{g \in G} \text{E} \left[ n(\text{deaths in age group g}) \right]
\end{align*}

### Expected Years of Life Lost
We used the life table for global population [WHO Life Table] for 2016 with estimates about expected number of life years left for all ages in 2016. E.g. a person at the age of 60 had 20.5 expected number of life years left in 2016.

We use it as an estimate of *Expected Years of Life Lost*. E.g. if a person dies at the age of 60 this means we estimate 20.5 of expected years of life lost.

We use an average EYLL by age and gender in a specific 10 year age group $g \in G$ as an estimate
for all deaths in each age group.

### Costs
A more realistic figure is probably a minimum of $129,000, which represents what it would cost to give a person an additional "quality-of-life adjusted" year of life [stanford]

If we had morbidity data:
The Quality-Adjusted Life Year (QALY) is a measure of the value and benefit of health outcomes.
Health is defined as a function of two components:
1. Length of life - ie. mortality
2. Quality of life - ie. morbidity

## Data Sources
* Case Fatality Risk (CFR) by age group estimates. From: 17th February (China), 17th March (Italy), 24th March (Spain, South Korea), source [@cfrs].
* Infection Fatality Risk (CFR) by age group estimates are from [@imperial].
* Deaths from major causes (from 2016) are from [@major].
* Global life tables are from [@expectancies].
* Estimated price of year of life from [@price].
* Data about age is from 2019, source [@pyramids].

## Acknowledgements
Tjaša Kovačević for help with the calculation of expected years of life lost and economic impacts on poverty.

## Author
Marko Lalović, email: here.

## Licenses
The source code is licensed <a href="http://opensource.org/licenses/mit-license.php">MIT</a>.

The website content is licensed <a href="https://creativecommons.org/licenses/by/4.0/deed.ast">CC BY 4.0</a>.


## Disclaimer
The author of this website is not a health expert or an epidemiologist and disclaims responsibility for any adverse effect resulting, directly or indirectly, from information contained in this website. For health, safety, and medical emergencies or updates on the novel coronavirus pandemic, you can get the latest information from [the WHO](https://www.who.int/emergencies/diseases/novel-coronavirus-2019) or search for official public health information for your country on [Google](https://www.google.com/search?q=Coronavirus) or on [Baidu](https://www.baidu.com/s?ie=utf-8&f=8&rsv_bp=1&rsv_idx=1&tn=baidu&wd=新冠病毒)


## References
