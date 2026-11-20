'use client'

import { signout } from '@gruent/hub/actions/auth'
import updatePassword from '@gruent/hub/actions/updatePassword'
import useSettingsStore, { Theme } from '@gruent/hub/stores/settingsStore'
import Container from '@gruent/libs/frontend/components/Container'
import { Button } from '@gruent/libs/frontend/components/core/button'
import { Checkbox } from '@gruent/libs/frontend/components/core/checkbox'
import {
  Field,
  FieldContent,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@gruent/libs/frontend/components/core/field'
import { Input } from '@gruent/libs/frontend/components/core/input'
import { RadioGroup, RadioGroupItem } from '@gruent/libs/frontend/components/core/radio-group'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'
import { FC, useState } from 'react'

const themeOptions = [
  { value: Theme.light, label: 'Light' },
  { value: Theme.dark, label: 'Dark' },
]

const UserPage: FC = () => {
  const theme = useSettingsStore((state) => state.theme)
  const setTheme = useSettingsStore((state) => state.setTheme)
  const showChannelEditorGrid = useSettingsStore((state) => state.showChannelEditorGrid)
  const setShowChannelEditorGrid = useSettingsStore((state) => state.setShowChannelEditorGrid)
  const showFeedbackButton = useSettingsStore((state) => state.showFeedbackButton)
  const setShowFeedbackButton = useSettingsStore((state) => state.setShowFeedbackButton)

  const [newPassword, setNewPassword] = useState('')

  const handlePasswordFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const formData = new FormData(e.currentTarget)
    const newPassword = formData.get('newPassword') as string

    const { error } = await updatePassword({ newPassword })

    if (error) {
      addToast({
        title: 'Failed to update password',
        body: error,
        level: 'error',
      })
    } else {
      addToast({
        title: 'Password updated',
        body: 'Your password has been updated successfully.',
        level: 'success',
      })
    }
  }

  const handleSignout = async () => {
    await signout()
  }

  return (
    <>
      <Container>
        <div className="mt-4 mb-6">
          <h1 className="text-xl">Profile</h1>
          <p>
            <small>Preferences and settings for your account.</small>
          </p>
        </div>
      </Container>
      <Container>
        <section className="mb-4">
          <section
            className="relative bg-gray-50 rounded-sm py-5 px-10 border border-gray-200 dark:bg-gray-900 dark:border-gray-800"
            style={{ boxShadow: '3px 3px 10px 0 rgba(0, 0, 0, 0.03)' }}
          >
            <h2>Theme</h2>
            <div className="flex">
              <FieldSet className="my-3">
                <FieldLegend variant="label">Choose a theme</FieldLegend>
                <RadioGroup
                  name="theme"
                  value={theme}
                  onValueChange={(value) => setTheme(value as Theme)}
                  className="flex flex-wrap gap-2"
                >
                  {themeOptions.map((option) => (
                    <FieldLabel
                      key={option.value}
                      htmlFor={`theme-${option.value}`}
                      className="max-w-56"
                    >
                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldTitle>{option.label}</FieldTitle>
                        </FieldContent>
                        <RadioGroupItem value={option.value} id={`theme-${option.value}`} />
                      </Field>
                    </FieldLabel>
                  ))}
                </RadioGroup>
              </FieldSet>
            </div>
            <h2 className="mt-4">Feedback</h2>
            <div className="flex">
              <FieldSet className="my-3">
                <FieldLegend variant="label">Show feedback button</FieldLegend>
                <Field orientation="horizontal" className="w-fit">
                  <Checkbox
                    id="showFeedbackCheckbox"
                    name="showFeedbackCheckbox"
                    value="true"
                    checked={showFeedbackButton}
                    onCheckedChange={(checked) => setShowFeedbackButton(checked === true)}
                  />
                  <FieldLabel htmlFor="showFeedbackCheckbox" className="font-normal">
                    Show
                  </FieldLabel>
                </Field>
              </FieldSet>
            </div>
          </section>
        </section>
      </Container>
      <Container className="mb-4">
        <section
          className="relative bg-gray-50 rounded-sm py-5 px-10 border border-gray-200 dark:bg-gray-900 dark:border-gray-800"
          style={{ boxShadow: '3px 3px 10px 0 rgba(0, 0, 0, 0.03)' }}
        >
          <h2>Channel Editor</h2>
          <div className="flex">
            <FieldSet className="my-3">
              <FieldLegend variant="label">Show grid</FieldLegend>
              <Field orientation="horizontal" className="w-fit">
                <Checkbox
                  id="showGridCheckbox"
                  name="showGridCheckbox"
                  value="true"
                  checked={showChannelEditorGrid}
                  onCheckedChange={(checked) => setShowChannelEditorGrid(checked === true)}
                />
                <FieldLabel htmlFor="showGridCheckbox" className="font-normal">
                  Show
                </FieldLabel>
              </Field>
            </FieldSet>
          </div>
        </section>
      </Container>
      <Container className="mb-4">
        <section
          className="relative bg-gray-50 rounded-sm py-5 px-10 border border-gray-200 dark:bg-gray-900 dark:border-gray-800"
          style={{ boxShadow: '3px 3px 10px 0 rgba(0, 0, 0, 0.03)' }}
        >
          <h2>Update Password</h2>
          <form onSubmit={handlePasswordFormSubmit} className="w-96">
            <Field className="my-3">
              <FieldLabel htmlFor="newPassword">New Password</FieldLabel>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            <Button type="submit" disabled={!newPassword}>
              Change password
            </Button>
          </form>
          <h2 className="mt-4">Sign out</h2>
          <Button onClick={() => handleSignout()}>Sign out</Button>
        </section>
      </Container>
    </>
  )
}

export default UserPage
