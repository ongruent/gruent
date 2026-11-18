'use client'

import {
  type LucideIcon,
  BellIcon,
  BracesIcon,
  CircleArrowOutUpRightIcon,
  CircleQuestionMarkIcon,
  CodeXmlIcon,
  CogIcon,
  DatabaseIcon,
  LogInIcon,
  SendIcon,
  SettingsIcon,
  SparklesIcon,
} from 'lucide-react'
import { FC, useEffect, useMemo, useState } from 'react'

type icon =
  | 'input'
  | 'processing1'
  | 'processing2'
  | 'processing3'
  | 'code'
  | 'machineLearning'
  | 'outputDatabase'
  | 'outputApi'
  | 'outputWebhook'
  | 'actionEmail'
  | 'actionNotification'

type Props = {
  icons: icon[]
  captions: string[]
  muted?: boolean
}

const NodeCard: FC<Props> = ({ icons = [], captions = ['Unknown'], muted = false }) => {
  const [currentIconIndex, setCurrentIconIndex] = useState<number>(0)

  const Icon: LucideIcon = useMemo(() => {
    switch (icons[currentIconIndex]) {
      case 'input':
        return LogInIcon
      case 'processing1':
        return SettingsIcon
      case 'processing2':
        return CogIcon
      case 'processing3':
      case 'code':
        return CodeXmlIcon
      case 'machineLearning':
        return SparklesIcon
      case 'outputDatabase':
        return DatabaseIcon
      case 'outputApi':
        return BracesIcon
      case 'outputWebhook':
        return CircleArrowOutUpRightIcon
      case 'actionEmail':
        return SendIcon
      case 'actionNotification':
        return BellIcon
      default:
        return CircleQuestionMarkIcon
    }
  }, [icons, currentIconIndex])

  const caption = useMemo(() => {
    if (captions[currentIconIndex]) return captions[currentIconIndex]
    return 'Unknown'
  }, [captions, currentIconIndex])

  useEffect(() => {
    const nextIconInterval = setInterval(() => {
      setCurrentIconIndex((current) => {
        if (current + 1 > icons.length - 1) return 0
        return current + 1
      })
    }, 3e3)

    return () => clearInterval(nextIconInterval)
  }, [icons.length])

  if (!muted) {
    return (
      <div
        style={{ height: 75, width: 75 }}
        className="flex flex-col items-center justify-center bg-gray-100 border border-green-500 rounded-lg transition select-none shadow cursor-pointer"
      >
        <Icon size="2em" className="text-gray-800" />
        <p className="text-gray-400 text-xs">{caption}</p>
      </div>
    )
  }

  return (
    <div
      style={{ height: 75, width: 75 }}
      className="flex flex-col items-center justify-center bg-gray-100 border border-gray-200 shadow-none transition select-none shadow cursor-pointer"
    >
      <Icon size="2em" className="text-gray-500" />
      <p className="text-gray-500 text-xs">{caption}</p>
    </div>
  )
}

export default NodeCard
