from django import forms
from django.contrib.auth.forms import AuthenticationForm


class UsernameAuthenticationForm(AuthenticationForm):
    username = forms.CharField(
        label="Username",
        widget=forms.TextInput(
            attrs={
                "class": "vx-input",
                "placeholder": "admin",
                "autocomplete": "username",
            }
        ),
    )
    password = forms.CharField(
        label="Password",
        strip=False,
        widget=forms.PasswordInput(
            attrs={
                "class": "vx-input",
                "placeholder": "Enter your password",
                "autocomplete": "current-password",
            }
        ),
    )

    def clean_username(self):
        return self.cleaned_data["username"].strip().lower()
